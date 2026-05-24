import { TriggerContext } from '@devvit/public-api';
import { CommentEvent, MinuteBucket, RadarMetrics, AlertLevel } from '../types/radar.js';

/**
 * Normalise un timestamp Unix en millisecondes à la minute inférieure 
 * et retourne la clé correspondante pour le stockage kvStore.
 * 
 * @param timestamp - Le timestamp Unix en millisecondes.
 * @returns La clé normalisée au format `radar:bucket:YYYY-MM-DD:HH:MM`.
 */
export function getMinuteKey(timestamp: number): string {
  const date = new Date(timestamp);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `radar:bucket:${yyyy}-${mm}-${dd}:${hh}:${min}`;
}

/**
 * Enregistre un événement de commentaire dans le bucket de la minute courante.
 * Implémente également un mécanisme opportuniste de nettoyage des clés obsolètes.
 * 
 * @param event - L'événement de commentaire à journaliser.
 * @param context - Le contexte d'exécution du trigger Devvit.
 */
export async function logCommentEvent(event: CommentEvent, context: TriggerContext): Promise<void> {
  const key = getMinuteKey(event.timestamp);
  
  // Lecture du bucket existant pour cette minute
  const existingRaw = await context.kvStore.get(key);
  let bucket: MinuteBucket;

  const normalizedMinute = Math.floor(event.timestamp / 60000) * 60000;

  if (existingRaw && typeof existingRaw === 'string') {
    try {
      bucket = JSON.parse(existingRaw) as MinuteBucket;
      bucket.count += 1;
      bucket.events.push(event);
    } catch (error) {
      // Fallback en cas d'erreur de parsing ou corruption
      bucket = {
        minuteTimestamp: normalizedMinute,
        count: 1,
        events: [event],
      };
    }
  } else {
    bucket = {
      minuteTimestamp: normalizedMinute,
      count: 1,
      events: [event],
    };
  }

  // Persistance du bucket dans le kvStore
  await context.kvStore.put(key, JSON.stringify(bucket));

  // Nettoyage opportuniste (10% de chances) des données vieilles de plus de 20 minutes
  if (Math.random() < 0.1) {
    await cleanupOldBuckets(event.timestamp, context);
  }
}

/**
 * Nettoie en parallèle les anciens buckets de minutes pour libérer la mémoire du kvStore.
 * Vise une fenêtre passée située entre t-30 minutes et t-20 minutes.
 * 
 * @param currentTimestamp - Timestamp de référence (généralement maintenant).
 * @param context - Le contexte d'exécution Devvit.
 */
async function cleanupOldBuckets(currentTimestamp: number, context: TriggerContext): Promise<void> {
  const deletePromises: Promise<void>[] = [];
  
  // Éviction active des buckets de la plage [t-30 min, t-20 min]
  for (let i = 20; i <= 30; i++) {
    const oldTimestamp = currentTimestamp - i * 60000;
    const oldKey = getMinuteKey(oldTimestamp);
    deletePromises.push(context.kvStore.delete(oldKey));
  }

  try {
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('[ModRadar] Erreur lors du nettoyage opportuniste du kvStore:', error);
  }
}

/**
 * Évalue les buckets sur les 15 dernières minutes glissantes pour calculer la vélocité 
 * et en déduire le niveau de menace global actuel.
 * 
 * Les 15 minutes sont découpées en 3 segments consécutifs de 5 minutes :
 * - Segment A (Actuel)  : minutes t-0 à t-4. Représente l'activité immédiate.
 * - Segment B (Moyen)   : minutes t-5 à t-9. Représente l'activité intermédiaire récente.
 * - Segment C (Ancien)  : minutes t-10 à t-14. Représente l'activité de référence.
 * 
 * @param context - Le contexte d'exécution Devvit.
 * @returns Un objet RadarMetrics contenant les calculs de vélocité et d'alerte.
 */
export async function evaluateSlidingWindow(context: TriggerContext): Promise<RadarMetrics> {
  const now = Date.now();
  const currentMinuteStart = Math.floor(now / 60000) * 60000;
  
  // Génération des clés pour les 15 dernières minutes glissantes
  const keys: string[] = [];
  for (let i = 0; i < 15; i++) {
    keys.push(getMinuteKey(currentMinuteStart - i * 60000));
  }

  // Récupération hautement parallélisée de tous les buckets
  const rawBuckets = await Promise.all(keys.map((key) => context.kvStore.get(key)));
  
  const buckets: (MinuteBucket | undefined)[] = rawBuckets.map((raw) => {
    if (typeof raw !== 'string') return undefined;
    try {
      return JSON.parse(raw) as MinuteBucket;
    } catch {
      return undefined;
    }
  });

  // Calcul des sommes d'événements par segment
  let sumA = 0; // t-0 à t-4 (indices 0 à 4)
  let sumB = 0; // t-5 à t-9 (indices 5 à 9)
  let sumC = 0; // t-10 à t-14 (indices 10 à 14)

  for (let i = 0; i < 5; i++) {
    const b = buckets[i];
    if (b) sumA += b.count;
  }
  for (let i = 5; i < 10; i++) {
    const b = buckets[i];
    if (b) sumB += b.count;
  }
  for (let i = 10; i < 15; i++) {
    const b = buckets[i];
    if (b) sumC += b.count;
  }

  const rollingFifteenMinCount = sumA + sumB + sumC;

  // Calcul de la Vélocité Relative (Accélération)
  // Formule : Delta = sumA / Moyenne(sumB, sumC)
  const pastAverage = (sumB + sumC) / 2;
  let velocityDelta = 0;

  if (pastAverage > 0) {
    velocityDelta = sumA / pastAverage;
  } else if (sumA > 0) {
    // Si l'activité historique était nulle mais qu'un pic survient,
    // on considère sumA comme l'accélération brute.
    velocityDelta = sumA;
  }

  // Déduction algorithmique du niveau d'alerte global (AlertLevel)
  let activeAlertLevel: AlertLevel = 'LOW';
  
  if (velocityDelta >= 4.0 && sumA >= 20) {
    // Le flux a quadruplé sur un volume significatif (min. 20 comms sur les 5 dernières minutes)
    activeAlertLevel = 'CRITICAL';
  } else if (velocityDelta >= 2.5) {
    activeAlertLevel = 'HIGH';
  } else if (velocityDelta >= 1.5) {
    activeAlertLevel = 'MEDIUM';
  } else {
    activeAlertLevel = 'LOW';
  }

  return {
    velocityDelta,
    rollingFifteenMinCount,
    activeAlertLevel,
    lastEvaluationTime: now,
  };
}

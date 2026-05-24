import { TriggerContext } from '@devvit/public-api';
import { CommentEvent, AppSettings, RadarMetrics, ThreatVector } from '../types/radar.js';

/**
 * Contexte de données traversant le pipeline de sécurité pour un commentaire donné.
 */
export interface PipelineContext {
  /** L'événement de commentaire en cours d'analyse */
  event: CommentEvent;
  /** Paramètres de configuration actifs de l'application */
  settings: AppSettings;
  /** Métriques calculées sur la fenêtre glissante */
  metrics: RadarMetrics;
  /** Le vecteur de menace en cours de construction */
  vector: ThreatVector;
}

/**
 * Signature type pour une fonction middleware du pipeline de sécurité.
 */
export type MiddlewareFunction = (ctx: PipelineContext, context: TriggerContext) => Promise<void>;

/**
 * Calcule l'indice de similarité de Jaccard entre deux ensembles de chaînes (subreddits).
 * J(A, B) = |A ∩ B| / |A ∪ B|
 * 
 * Cette implémentation est insensible à la casse.
 * 
 * @param userSubs - Liste des subreddits fréquentés par l'utilisateur.
 * @param watchlistSubs - Liste de surveillance des subreddits cibles (blacklist/watchlist).
 * @returns Un flottant entre 0.0 et 1.0.
 */
export function calculateJaccardSimilarity(userSubs: string[], watchlistSubs: string[]): number {
  if (userSubs.length === 0 || watchlistSubs.length === 0) {
    return 0.0;
  }

  // Normalisation en minuscules et création de Sets pour éliminer les doublons
  const setA = new Set(userSubs.map((s) => s.toLowerCase()));
  const setB = new Set(watchlistSubs.map((s) => s.toLowerCase()));

  // Calcul de l'intersection
  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize++;
    }
  }

  // Calcul de l'union : |A| + |B| - |A ∩ B|
  const unionSize = setA.size + setB.size - intersectionSize;

  if (unionSize === 0) {
    return 0.0;
  }

  return intersectionSize / unionSize;
}

/**
 * Middleware 1 : Vérifie si le compte est récent.
 * Si l'âge du compte est inférieur au seuil de confiance, augmente le score de risque.
 */
export const checkAccountAge: MiddlewareFunction = async (ctx) => {
  if (ctx.event.accountAgeWeeks < ctx.settings.trustedAccountAgeWeeks) {
    ctx.vector.riskScore += 30;
    ctx.vector.triggeredRules.push('NEW_ACCOUNT');
  }
};

/**
 * Middleware 2 : Évalue l'accélération globale du subreddit.
 * Ajoute un malus si le subreddit subit actuellement une forte vélocité.
 */
export const checkGlobalVelocity: MiddlewareFunction = async (ctx) => {
  const alertLevel = ctx.metrics.activeAlertLevel;
  
  if (alertLevel === 'HIGH') {
    ctx.vector.riskScore += 20;
    ctx.vector.triggeredRules.push('HIGH_SUBREDDIT_VELOCITY');
  } else if (alertLevel === 'CRITICAL') {
    ctx.vector.riskScore += 40;
    ctx.vector.triggeredRules.push('CRITICAL_SUBREDDIT_VELOCITY');
  }
};

/**
 * Middleware 3 : Détecte les anomalies de proximité (analyse historique Jaccard).
 * Intègre un Circuit Breaker : ne fait pas d'appel API coûteux si l'utilisateur est de confiance
 * ET que la vélocité globale est calme (LOW).
 */
export const checkProximityAnomalies: MiddlewareFunction = async (ctx, context) => {
  const isTrusted = ctx.event.accountAgeWeeks >= ctx.settings.trustedAccountAgeWeeks;
  const isLowAlert = ctx.metrics.activeAlertLevel === 'LOW';

  // CIRCUIT BREAKER / EARLY EXIT : 
  // Épargne le quota d'appels API Reddit si la menace globale et l'ancienneté du compte sont au vert.
  if (isTrusted && isLowAlert) {
    return;
  }

  try {
    // Récupération des 20 dernières contributions de l'utilisateur
    const comments = await context.reddit.getCommentsByUser({
      username: ctx.event.author,
      limit: 20,
    }).all();

    if (comments && comments.length > 0) {
      // Extraction unique des noms de subreddits
      const userSubs = comments
        .map((c) => c.subredditName)
        .filter((name): name is string => typeof name === 'string' && name.length > 0);

      // Calcul de similarité de Jaccard
      const similarity = calculateJaccardSimilarity(userSubs, ctx.settings.jaccardWatchlist);
      ctx.vector.jaccardSimilarity = similarity;

      // Si similarité détectée, on calcule et applique la pénalité
      if (similarity > 0) {
        const jaccardPenalty = Math.round(similarity * 100);
        ctx.vector.riskScore += jaccardPenalty;
        ctx.vector.triggeredRules.push('WATCHLIST_PROXIMITY_MATCH');
      }
    }
  } catch (error) {
    // On capture les erreurs d'API (utilisateur supprimé, suspendu, ou restrictions réseau)
    // pour éviter d'interrompre l'exécution globale du trigger
    console.warn(`[ModRadar] Échec de l'analyse historique Jaccard pour u/${ctx.event.author}:`, error);
  }
};

/**
 * Orchestrateur principal exécutant séquentiellement les middlewares de sécurité.
 * Si le score de risque calculé dépasse le seuil défini, applique automatiquement 
 * un filtrage défensif sur le commentaire.
 * 
 * @param event - Le commentaire soumis.
 * @param settings - Paramètres actuels de l'application.
 * @param metrics - Métriques temporelles calculées sur la fenêtre active.
 * @param context - Contexte du trigger Devvit.
 * @returns Le ThreatVector finalisé pour cet utilisateur.
 */
export async function executePipeline(
  event: CommentEvent,
  settings: AppSettings,
  metrics: RadarMetrics,
  context: TriggerContext
): Promise<ThreatVector> {
  // Initialisation du vecteur de menace par défaut
  const vector: ThreatVector = {
    username: event.author,
    jaccardSimilarity: 0.0,
    riskScore: 0,
    triggeredRules: [],
    isFlagged: false,
  };

  const ctx: PipelineContext = {
    event,
    settings,
    metrics,
    vector,
  };

  // Liste ordonnée de nos middlewares
  const middlewares: MiddlewareFunction[] = [
    checkAccountAge,
    checkGlobalVelocity,
    checkProximityAnomalies,
  ];

  // Exécution séquentielle asynchrone
  for (const middleware of middlewares) {
    await middleware(ctx, context);
  }

  // Sécurisation et normalisation du score global entre 0 et 100
  vector.riskScore = Math.min(100, Math.max(0, vector.riskScore));

  // Décision d'action défensive automatique
  if (vector.riskScore >= settings.autoActionThresholdScore) {
    vector.isFlagged = true;
    
    // Action défensive silencieuse : redirection vers la file de modération (Mod Queue)
    try {
      await context.reddit.remove(event.id, false);
      console.info(`[ModRadar] Commentaire ${event.id} filtré. Auteur: u/${event.author} (Score de risque: ${vector.riskScore}/100)`);
    } catch (error) {
      console.error(`[ModRadar] Échec du filtrage automatique du commentaire ${event.id}:`, error);
    }
  }

  return vector;
}

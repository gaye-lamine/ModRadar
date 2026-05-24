/**
 * @file radar.ts
 * @description Typage strict pour ModRadar: Predictive Raid & Brigading Shield.
 * Définit les modèles de données optimisés pour le stockage kvStore temporisé par minute
 * et les pipelines de traitement de Devvit.
 */

/**
 * Représente la trace compacte d'un commentaire soumis sur le subreddit.
 * Conçu pour minimiser l'occupation mémoire en kvStore.
 */
export interface CommentEvent {
  /** Identifiant unique du commentaire Reddit (ex: 't1_l12345') */
  id: string;
  /** Nom d'utilisateur de l'auteur (sans préfixe u/) */
  author: string;
  /** Timestamp Unix en millisecondes du moment de soumission */
  timestamp: number;
  /** Âge du compte de l'auteur en semaines au moment du commentaire */
  accountAgeWeeks: number;
}

/**
 * Représente un bucket d'agrégation d'une minute stocké individuellement dans le kvStore.
 * Clé kvStore recommandée : `radar:bucket:YYYY-MM-DD:HH:MM`
 */
export interface MinuteBucket {
  /** Timestamp normalisé du début de la minute en millisecondes (ex: 2026-05-22T15:25:00.000Z) */
  minuteTimestamp: number;
  /** Nombre total de commentaires soumis dans cette minute (pour calcul de vélocité) */
  count: number;
  /** Liste des événements individuels de commentaires capturés pour cette minute */
  events: CommentEvent[];
}

/**
 * Niveaux de menace globaux pour le subreddit.
 */
export type AlertLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Métriques globales de vélocité et d'anomalie du subreddit calculées sur la fenêtre glissante.
 */
export interface RadarMetrics {
  /** 
   * Dérivée/Accélération de la vélocité : variation relative du flux de commentaires
   * par rapport aux intervalles précédents (ex: (B_actuel - B_precedent) / B_precedent)
   */
  velocityDelta: number;
  /** Volume total de commentaires agrégés dans la fenêtre glissante active (ex: 15 minutes) */
  rollingFifteenMinCount: number;
  /** Niveau d'alerte en temps réel déduit par le pipeline d'analyse */
  activeAlertLevel: AlertLevel;
  /** Timestamp Unix de la dernière évaluation globale des métriques */
  lastEvaluationTime: number;
}

/**
 * Vecteur de menace comportementale associé à un utilisateur suspect.
 * Issu de l'analyse de proximité et du calcul de similarité de Jaccard.
 */
export interface ThreatVector {
  /** Nom de l'utilisateur analysé */
  username: string;
  /** 
   * Indice de similarité de Jaccard (de 0.0 à 1.0) mesurant le chevauchement 
   * entre les subreddits où l'utilisateur commente et la watchlist configurée.
   */
  jaccardSimilarity: number;
  /** Score global de risque calculé (0 à 100), combinant l'indice de Jaccard, l'âge du compte et la vélocité */
  riskScore: number;
  /** Liste des règles de sécurité enfreintes (ex: ['JACCARD_SPIKE', 'NEW_ACCOUNT_SPAM']) */
  triggeredRules: string[];
  /** Flag pour indiquer si l'utilisateur requiert une action ou un signalement prioritaire */
  isFlagged: boolean;
}

/**
 * Paramètres généraux configurables de l'application ModRadar par les modérateurs.
 */
export interface AppSettings {
  /** Seuil de vélocité (commentaires / 15min) pour déclencher l'alerte MEDIUM */
  velocityMediumThreshold: number;
  /** Seuil de vélocité (commentaires / 15min) pour déclencher l'alerte HIGH */
  velocityHighThreshold: number;
  /** Seuil de vélocité (commentaires / 15min) pour déclencher l'alerte CRITICAL */
  velocityCriticalThreshold: number;
  /** Liste des subreddits hostiles ou sources potentielles de raids ciblés pour l'indice Jaccard */
  jaccardWatchlist: string[];
  /** Indice de similarité de Jaccard minimal pour flagger un utilisateur suspect (ex: 0.15) */
  jaccardThreshold: number;
  /** Activation automatique du Lockdown (confinement) en cas d'alerte CRITICAL */
  enableAutoLockdown: boolean;
  /** Durée par défaut d'un confinement en minutes lors d'un déclenchement automatique */
  lockdownDurationMinutes: number;
  /** Âge minimum d'un compte (en semaines) pour être qualifié de 'Trusted' et sauter l'analyse Jaccard */
  trustedAccountAgeWeeks: number;
  /** Score de risque minimal pour déclencher une action de modération automatique (ex: 75) */
  autoActionThresholdScore: number;
}

/**
 * État persistant global du bouclier ModRadar et du Dashboard NOC.
 * Clé kvStore recommandée : `radar:state`
 */
export interface RadarState {
  /** Indique si le mode de confinement (Lockdown) est présentement activé sur le subreddit */
  isLockdownActive: boolean;
  /** Timestamp Unix (ms) d'expiration automatique du confinement (null si inactif) */
  lockdownExpiresAt: number | null;
  /** Liste ordonnée des métriques passées pour l'affichage graphique sur le Dashboard */
  metricsHistory: RadarMetrics[];
  /** Historique des derniers vecteurs de menaces identifiés pour affichage sur le tableau de bord */
  recentThreats: ThreatVector[];
  [key: string]: any;
}

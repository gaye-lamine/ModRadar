import { Devvit, useState, useAsync } from '@devvit/public-api';
import { CommentEvent, AppSettings, RadarState, ThreatVector, RadarMetrics, AlertLevel } from './types/radar.js';
import { logCommentEvent, evaluateSlidingWindow } from './backend/sliding-window.js';
import { executePipeline } from './backend/pipeline.js';

// 1. CONFIGURATION DE L'APPLICATION ET SES CAPACITÉS NATIVES
Devvit.configure({
  redditAPI: true,
  kvStore: true,
});

// Declaration of user settings (AppSettings) via Devvit Settings Form
Devvit.addSettings([
  {
    type: 'number',
    name: 'autoActionThresholdScore',
    label: 'Risk score threshold for automatic moderation (0-100)',
    defaultValue: 75,
  },
  {
    type: 'number',
    name: 'minAccountAgeWeeks',
    label: 'Minimum trusted account age (weeks)',
    defaultValue: 4,
  },
  {
    type: 'string',
    name: 'watchlistSubreddits',
    label: 'Watchlist subreddits (comma-separated)',
    defaultValue: 'all,freekarma4all,freekarma4u',
  },
  {
    type: 'number',
    name: 'lockdownDurationMinutes',
    label: 'Automatic lockdown duration (minutes)',
    defaultValue: 30,
  },
]);

// 2. SCHEDULED DECONFINEMENT WORKER (SCHEDULER JOB)
Devvit.addSchedulerJob({
  name: 'release_lockdown_job',
  onRun: async (event, context) => {
    try {
      console.info('[ModRadar] Executing scheduled lockdown release job...');
      
      const stateRaw = await context.kvStore.get('radar:global:state');
      let state: RadarState = {
        isLockdownActive: false,
        lockdownExpiresAt: null,
        metricsHistory: [],
        recentThreats: [],
      };

      if (stateRaw && typeof stateRaw === 'string') {
        try {
          state = JSON.parse(stateRaw);
        } catch (e) {
          console.warn('[ModRadar] Error during state deserialization, resetting to default.');
        }
      }

      state.isLockdownActive = false;
      state.lockdownExpiresAt = null;

      await context.kvStore.put('radar:global:state', JSON.stringify(state));

      const subreddit = await context.reddit.getCurrentSubreddit();
      console.info(`[ModRadar] Automatic lockdown on r/${subreddit.name} has expired. Status reset to MONITORING ACTIVE.`);
    } catch (error) {
      console.error('[ModRadar] Critical failure during automatic lockdown release:', error);
    }
  },
});

// 3. L'ÉCOUTEUR DE FLUX DE COMMENTAIRES (TRIGGER EVENT)
Devvit.addTrigger({
  event: 'CommentSubmit',
  onEvent: async (event, context) => {
    try {
      const settingsObj = await context.settings.getAll();
      
      const watchlistStr = (settingsObj.watchlistSubreddits as string) || '';
      const jaccardWatchlist = watchlistStr
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const appSettings: AppSettings = {
        velocityMediumThreshold: 1.5,
        velocityHighThreshold: 2.5,
        velocityCriticalThreshold: 4.0,
        jaccardWatchlist: jaccardWatchlist,
        jaccardThreshold: 0.15,
        enableAutoLockdown: true,
        lockdownDurationMinutes: Number(settingsObj.lockdownDurationMinutes) || 30,
        trustedAccountAgeWeeks: Number(settingsObj.minAccountAgeWeeks) || 4,
        autoActionThresholdScore: Number(settingsObj.autoActionThresholdScore) || 75,
      };

      const commentId = event.comment?.id;
      const authorName = event.author?.name || event.comment?.author;

      if (!commentId || !authorName) {
        return;
      }

      let accountAgeWeeks = 100;
      try {
        const user = await context.reddit.getUserByUsername(authorName);
        if (user) {
          const createdAt = user.createdAt.getTime();
          accountAgeWeeks = (Date.now() - createdAt) / (1000 * 60 * 60 * 24 * 7);
        }
      } catch (e) {
        console.warn(`[ModRadar] Unable to query account age for u/${authorName}, assigning low fallback.`);
        accountAgeWeeks = 0;
      }

      const commentEvent: CommentEvent = {
        id: commentId,
        author: authorName,
        timestamp: event.comment?.createdAt || Date.now(),
        accountAgeWeeks,
      };

      await logCommentEvent(commentEvent, context);

      const metrics = await evaluateSlidingWindow(context);

      const threatVector = await executePipeline(commentEvent, appSettings, metrics, context);

      const stateRaw = await context.kvStore.get('radar:global:state');
      let state: RadarState = {
        isLockdownActive: false,
        lockdownExpiresAt: null,
        metricsHistory: [],
        recentThreats: [],
      };

      if (stateRaw && typeof stateRaw === 'string') {
        try {
          state = JSON.parse(stateRaw);
        } catch (e) {}
      }

      if (metrics.activeAlertLevel === 'CRITICAL' && appSettings.enableAutoLockdown && !state.isLockdownActive) {
        state.isLockdownActive = true;
        const durationMs = appSettings.lockdownDurationMinutes * 60000;
        state.lockdownExpiresAt = Date.now() + durationMs;

        await context.scheduler.runJob({
          name: 'release_lockdown_job',
          runAt: new Date(Date.now() + appSettings.lockdownDurationMinutes * 60000),
        });

        console.warn(`[ModRadar] AUTOMATIC LOCKDOWN ACTIVATED suite to critical comment velocity spike (${metrics.velocityDelta.toFixed(2)}x).`);
      }

      state.metricsHistory.push(metrics);
      if (state.metricsHistory.length > 15) {
        state.metricsHistory.shift();
      }

      if (threatVector.isFlagged || threatVector.riskScore >= 40) {
        state.recentThreats = state.recentThreats.filter((t: ThreatVector) => t.username !== threatVector.username);
        state.recentThreats.unshift(threatVector);
        
        if (state.recentThreats.length > 10) {
          state.recentThreats.pop();
        }
      }

      await context.kvStore.put('radar:global:state', JSON.stringify(state));

    } catch (error) {
      console.error('[ModRadar] Critical failure handling CommentSubmit trigger:', error);
    }
  },
});

// NOC THEME AND COLOR PALETTE
const NOC_THEME = {
  bg: '#0A0B10',
  panelBg: '#12131C',
  border: '#1F2233',
  cyan: '#00F0FF',
  green: '#00FF66',
  orange: '#FF9900',
  red: '#FF1E56',
  white: '#FFFFFF',
  textSecondary: '#8F9CAE',
  textMuted: '#525A6C'
};

function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case 'CRITICAL':
      return NOC_THEME.red;
    case 'HIGH':
      return NOC_THEME.orange;
    case 'MEDIUM':
      return '#FFE500';
    case 'LOW':
    default:
      return NOC_THEME.green;
  }
}

// 4. CUSTOM POST DASHBOARD (INTERACTIVE NOC CONSOLE)
Devvit.addCustomPostType({
  name: 'ModRadar Dashboard',
  render: (context) => {
    // 1. Pending action tracking (drives the server-side useAsync execution)
    const [pendingAction, setPendingAction] = useState<string>('init');

    // 2. useAsync performs server-side read operations purely (fully secure & authorized context!)
    const { data: radarState } = useAsync<any>(async () => {
      const raw = await context.kvStore.get('radar:global:state');
      if (raw && typeof raw === 'string') {
        try {
          return JSON.parse(raw) as RadarState;
        } catch (e) {
          console.error('[ModRadar] Error deserializing state:', e);
        }
      }
      return {
        isLockdownActive: false,
        lockdownExpiresAt: null,
        metricsHistory: [],
        recentThreats: [],
      } as RadarState;
    }, {
      depends: [pendingAction]
    });

    const state = (radarState as any) as RadarState || {
      isLockdownActive: false,
      lockdownExpiresAt: null,
      metricsHistory: [],
      recentThreats: [],
    };

    const latestMetrics = state.metricsHistory.length > 0 
      ? state.metricsHistory[state.metricsHistory.length - 1] 
      : null;

    const currentAlertLevel = latestMetrics ? latestMetrics.activeAlertLevel : 'LOW';
    const currentVelocity = latestMetrics ? latestMetrics.velocityDelta.toFixed(2) : '0.00';
    const currentRollingVolume = latestMetrics ? latestMetrics.rollingFifteenMinCount : 0;

    const telemetryPoints = state.metricsHistory.slice(-15);
    const maxVolumeInHistory = telemetryPoints.length > 0
      ? Math.max(...telemetryPoints.map((m: RadarMetrics) => m.rollingFifteenMinCount), 10)
      : 10;

    // 3. Handlers run mutations and updates asynchronously
    const handleRefresh = () => {
      setPendingAction(`refresh_${Date.now()}`);
      context.ui.showToast({
        text: '📡 Synchronizing NOC telemetry logs...',
        appearance: 'success',
      });
    };

    const handleToggleLockdown = async () => {
      context.ui.showToast({
        text: '🛡️ Updating security policies...',
        appearance: 'neutral',
      });

      const raw = await context.kvStore.get('radar:global:state');
      let currState: RadarState = {
        isLockdownActive: false,
        lockdownExpiresAt: null,
        metricsHistory: [],
        recentThreats: [],
      };
      if (raw && typeof raw === 'string') {
        try {
          currState = JSON.parse(raw);
        } catch (e) {}
      }

      const isLockdownActive = !currState.isLockdownActive;
      const durationMinutes = 30; 
      const durationMs = durationMinutes * 60000;
      const lockdownExpiresAt = isLockdownActive ? Date.now() + durationMs : null;

      const newState = {
        ...currState,
        isLockdownActive,
        lockdownExpiresAt,
      };

      // Direct write operations, NO try/catch to let Asyncify ServerCallRequired bubble up normally
      await context.kvStore.put('radar:global:state', JSON.stringify(newState));

      if (isLockdownActive) {
        await context.scheduler.runJob({
          name: 'release_lockdown_job',
          runAt: new Date(Date.now() + durationMs),
        });
      }

      setPendingAction(`toggle_lockdown_${Date.now()}`);

      context.ui.showToast({
        text: isLockdownActive ? '🛑 Lockdown Activated successfully!' : '🟢 Lockdown Released successfully!',
        appearance: 'success',
      });
    };

    const handleInspectUser = (username: string) => {
      context.ui.showToast({
        text: `📡 Deep scan initiated for u/${username}`,
        appearance: 'success',
      });
    };

    // 4. DIRECT PREMIUM NOC LAYOUT RENDER
    return (
      <vstack padding="medium" backgroundColor={NOC_THEME.bg} width="100%" height="100%" gap="small">
        
        {/* HEADER SECTION (NOC CONTROL BAR) */}
        <hstack width="100%" alignment="middle" padding="medium" backgroundColor={NOC_THEME.panelBg} cornerRadius="medium" border="thin" borderColor={NOC_THEME.border}>
          <vstack gap="small">
            <hstack gap="small" alignment="middle">
              <text size="large" weight="bold" color={NOC_THEME.cyan}>📡 MODRADAR</text>
              <text size="small" color={NOC_THEME.textMuted}>//</text>
              <text size="small" weight="bold" color={NOC_THEME.white}>SHIELD NOC</text>
            </hstack>
            
            <hstack gap="small" alignment="middle">
              {state.isLockdownActive ? (
                <hstack padding="small" backgroundColor={`${NOC_THEME.red}22`} cornerRadius="small" border="thin" borderColor={NOC_THEME.red}>
                  <text size="xsmall" weight="bold" color={NOC_THEME.red}>🛑 LOCKDOWN ACTIVE</text>
                </hstack>
              ) : (
                <hstack padding="small" backgroundColor={`${NOC_THEME.green}22`} cornerRadius="small" border="thin" borderColor={NOC_THEME.green}>
                  <text size="xsmall" weight="bold" color={NOC_THEME.green}>🟢 MONITORING ACTIVE</text>
                </hstack>
              )}
              
              <hstack padding="small" backgroundColor="#1A1C29" cornerRadius="small" border="thin" borderColor={NOC_THEME.border}>
                <text size="xsmall" color={NOC_THEME.textSecondary}>ALERT LEVEL: </text>
                <text size="xsmall" weight="bold" color={getAlertColor(currentAlertLevel)}>
                  {currentAlertLevel}
                </text>
              </hstack>
            </hstack>
          </vstack>

          <spacer />

          {/* SYSTEM CONTROL BUTTONS */}
          <hstack gap="small" alignment="middle">
            <button
              size="small"
              appearance="secondary"
              onPress={handleRefresh}
            >
              🔄 Refresh
            </button>
            <button
              size="small"
              appearance={state.isLockdownActive ? 'primary' : 'destructive'}
              onPress={handleToggleLockdown}
            >
              {state.isLockdownActive ? '🔓 Release Lockdown' : '🔒 Activate Lockdown'}
            </button>
          </hstack>
        </hstack>

        {/* TELEMETRY CHART SECTION */}
        <vstack padding="medium" backgroundColor={NOC_THEME.panelBg} cornerRadius="medium" border="thin" borderColor={NOC_THEME.border} gap="small">
          <hstack width="100%">
            <vstack>
              <text size="small" weight="bold" color={NOC_THEME.white}>INGESTION TELEMETRY (15-MINUTE ROLLING WINDOW)</text>
              <text size="xsmall" color={NOC_THEME.textSecondary}>Real-time tracking of incoming comment volume & velocity</text>
            </vstack>
            <spacer />
            <hstack gap="medium" alignment="middle">
              <vstack alignment="end">
                <text size="xsmall" color={NOC_THEME.textSecondary}>VOLUME</text>
                <text size="small" weight="bold" color={NOC_THEME.cyan}>{currentRollingVolume} comments</text>
              </vstack>
              <vstack alignment="end">
                <text size="xsmall" color={NOC_THEME.textSecondary}>VELOCITY</text>
                <text size="small" weight="bold" color={getAlertColor(currentAlertLevel)}>x{currentVelocity}</text>
              </vstack>
            </hstack>
          </hstack>

          {telemetryPoints.length === 0 ? (
            <vstack height="100px" alignment="center middle" backgroundColor={NOC_THEME.bg} cornerRadius="medium">
              <text size="small" color={NOC_THEME.textSecondary}>📡 Initializing sensors... awaiting comments</text>
            </vstack>
          ) : (
            <hstack gap="small" alignment="bottom center" height="100px" padding="small" backgroundColor={NOC_THEME.bg} cornerRadius="medium" border="thin" borderColor={NOC_THEME.border}>
              {telemetryPoints.map((metrics: RadarMetrics, index: number) => {
                const barHeight = Math.round((metrics.rollingFifteenMinCount / maxVolumeInHistory) * 70);
                const finalBarHeight = Math.max(5, barHeight);

                return (
                  <vstack key={`telemetry-bar-${index}`} alignment="bottom center" gap="small">
                    <vstack 
                      width="18px" 
                      height={`${finalBarHeight}px`} 
                      backgroundColor={getAlertColor(metrics.activeAlertLevel)} 
                      cornerRadius="small" 
                    />
                    <text size="xsmall" color={NOC_THEME.textSecondary}>
                      {`-${14 - index}m`}
                    </text>
                  </vstack>
                );
              })}
            </hstack>
          )}
        </vstack>

        {/* BEHAVIORAL THREATS FEED SECTION */}
        <vstack padding="medium" backgroundColor={NOC_THEME.panelBg} cornerRadius="medium" border="thin" borderColor={NOC_THEME.border} gap="small">
          <vstack>
            <text size="small" weight="bold" color={NOC_THEME.white}>BEHAVIORAL THREAT VECTORS (JACCARD PROXIMITY)</text>
            <text size="xsmall" color={NOC_THEME.textSecondary}>Identified accounts matching behavioral signature watchlists</text>
          </vstack>

          <vstack gap="small">
            {state.recentThreats.length === 0 ? (
              <vstack padding="medium" alignment="center middle" backgroundColor={NOC_THEME.bg} cornerRadius="medium" border="thin" borderColor={NOC_THEME.border}>
                <text size="small" color={NOC_THEME.green}>🛡️ No threat vectors detected. Subreddit secure.</text>
              </vstack>
            ) : (
              <vstack gap="small">
                {/* Table header */}
                <hstack padding="small" backgroundColor={NOC_THEME.bg} cornerRadius="small" border="thin" borderColor={NOC_THEME.border} alignment="middle">
                  <hstack width="25%">
                    <text size="xsmall" weight="bold" color={NOC_THEME.textSecondary}>USER</text>
                  </hstack>
                  <hstack width="20%">
                    <text size="xsmall" weight="bold" color={NOC_THEME.textSecondary}>RISK SCORE</text>
                  </hstack>
                  <hstack width="20%">
                    <text size="xsmall" weight="bold" color={NOC_THEME.textSecondary}>JACCARD SIMILARITY</text>
                  </hstack>
                  <hstack width="25%">
                    <text size="xsmall" weight="bold" color={NOC_THEME.textSecondary}>TRIGGERED RULES</text>
                  </hstack>
                  <hstack width="10%" alignment="end">
                    <text size="xsmall" weight="bold" color={NOC_THEME.textSecondary}>ACTION</text>
                  </hstack>
                </hstack>

                {/* Table rows */}
                {state.recentThreats.map((threat: ThreatVector, index: number) => {
                  const threatColor = threat.riskScore >= 75 ? NOC_THEME.red : threat.riskScore >= 40 ? NOC_THEME.orange : NOC_THEME.green;
                  
                  return (
                    <hstack 
                      key={`threat-${threat.username}-${index}`} 
                      padding="small" 
                      backgroundColor={NOC_THEME.bg} 
                      cornerRadius="small" 
                      border="thin"
                      borderColor={`${threatColor}33`}
                      alignment="middle"
                    >
                      <hstack width="25%">
                        <text size="small" weight="bold" color={NOC_THEME.white}>u/{threat.username}</text>
                      </hstack>
                      <hstack width="20%">
                        <hstack gap="small" alignment="middle">
                          <text size="small" weight="bold" color={threatColor}>{threat.riskScore}/100</text>
                          <text size="xsmall" color={NOC_THEME.textSecondary}>
                            {threat.riskScore >= 75 ? '🔥 HIGH' : threat.riskScore >= 40 ? '⚠️ MED' : '🟢 LOW'}
                          </text>
                        </hstack>
                      </hstack>
                      <hstack width="20%">
                        <text size="small" weight="bold" color={NOC_THEME.cyan}>
                          {(threat.jaccardSimilarity * 100).toFixed(0)}%
                        </text>
                      </hstack>
                      <hstack width="25%">
                        <text size="xsmall" color={NOC_THEME.textSecondary}>
                          {threat.triggeredRules.join(', ') || 'NONE'}
                        </text>
                      </hstack>
                      <hstack width="10%" alignment="end">
                        <button
                          size="small"
                          appearance="secondary"
                          onPress={() => handleInspectUser(threat.username)}
                        >
                          Inspect
                        </button>
                      </hstack>
                    </hstack>
                  );
                })}
              </vstack>
            )}
          </vstack>
        </vstack>

      </vstack>
    );
  },
});

// 5. ADD MENU ITEM FOR EASY CREATION OF DASHBOARD BY MODERATORS
Devvit.addMenuItem({
  label: 'Create ModRadar Dashboard',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    try {
      const subreddit = await context.reddit.getCurrentSubreddit();
      const post = await context.reddit.submitPost({
        title: '🛡️ ModRadar - NOC System Dashboard',
        subredditName: subreddit.name,
        preview: (
          <vstack height="100%" width="100%" alignment="middle center">
            <text size="large" weight="bold">Initializing ModRadar...</text>
            <text size="medium" color="gray">Loading security pipeline...</text>
          </vstack>
        ),
      });
      context.ui.showToast({
        text: '🎉 Dashboard created successfully!',
        appearance: 'success',
      });
      context.ui.navigateTo(post);
    } catch (error) {
      console.error('[ModRadar] Error during Custom Post creation:', error);
      context.ui.showToast({
        text: '❌ Unable to create Dashboard. Check moderator permissions.',
        appearance: 'neutral',
      });
    }
  },
});

export default Devvit;

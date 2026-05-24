import { Devvit } from '@devvit/public-api';
import { RadarState, AlertLevel, ThreatVector, RadarMetrics } from '../types/radar.js';

interface DashboardProps {
  state: RadarState;
  onToggleLockdown: () => void | Promise<void>;
  onInspectUser: (username: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}

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

export function ModRadarDashboard(props: DashboardProps): JSX.Element {
  const { state } = props;

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
            onPress={props.onRefresh}
          >
            🔄 Refresh
          </button>
          <button
            size="small"
            appearance={state.isLockdownActive ? 'primary' : 'destructive'}
            onPress={props.onToggleLockdown}
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
              // Map heights cleanly between 5 and 70px to keep spacing breathable
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
                        onPress={() => props.onInspectUser(threat.username)}
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
}

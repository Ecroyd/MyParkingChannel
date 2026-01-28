import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface OpsAlertEmailProps {
  alertTitle: string;
  alertType: 'error' | 'warning' | 'info';
  message: string;
  details?: Record<string, any>;
  tenantName?: string;
  timestamp: string;
}

export function OpsAlertEmail(props: OpsAlertEmailProps) {
  const {
    alertTitle,
    alertType,
    message,
    details,
    tenantName,
    timestamp,
  } = props;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const alertColors = {
    error: { bg: '#fee', border: '#fcc', text: '#c33' },
    warning: { bg: '#ffd', border: '#fc9', text: '#963' },
    info: { bg: '#eef', border: '#ccf', text: '#339' },
  };

  const colors = alertColors[alertType] || alertColors.info;

  return (
    <Html>
      <Head />
      <Preview>{alertTitle} - {tenantName || 'My Parking Channel'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{alertTitle}</Heading>
          
          <Section style={{ ...alertBox, backgroundColor: colors.bg, borderColor: colors.border }}>
            <Text style={{ ...text, color: colors.text }}>
              {message}
            </Text>
          </Section>

          {tenantName && (
            <Section style={section}>
              <Text style={label}>Tenant</Text>
              <Text style={value}>{tenantName}</Text>
            </Section>
          )}

          <Section style={section}>
            <Text style={label}>Time</Text>
            <Text style={value}>{formatDate(timestamp)}</Text>
          </Section>

          {details && Object.keys(details).length > 0 && (
            <Section style={section}>
              <Text style={label}>Details</Text>
              <pre style={pre}>
                {JSON.stringify(details, null, 2)}
              </pre>
            </Section>
          )}

          <Text style={footer}>
            This is an automated alert from My Parking Channel.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
};

const alertBox = {
  padding: '16px',
  borderRadius: '5px',
  border: '2px solid',
  margin: '20px 0',
};

const section = {
  padding: '16px 0',
  borderBottom: '1px solid #e6ebf1',
};

const label = {
  color: '#666',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  margin: '0 0 4px',
};

const value = {
  color: '#333',
  fontSize: '16px',
  fontWeight: '500',
  margin: '0',
};

const pre = {
  backgroundColor: '#f5f5f5',
  padding: '12px',
  borderRadius: '4px',
  fontSize: '12px',
  lineHeight: '18px',
  overflow: 'auto',
  color: '#333',
  margin: '8px 0 0',
};

const footer = {
  color: '#666',
  fontSize: '14px',
  lineHeight: '24px',
  marginTop: '40px',
};

export default OpsAlertEmail;

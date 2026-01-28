import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface SetupInviteEmailProps {
  inviteUrl: string;
  tenantName: string;
  inviterName?: string;
  inviterEmail?: string;
  expiresAt?: string;
}

export function SetupInviteEmail(props: SetupInviteEmailProps) {
  const {
    inviteUrl,
    tenantName,
    inviterName,
    inviterEmail,
    expiresAt,
  } = props;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Html>
      <Head />
      <Preview>You've been invited to join {tenantName} on My Parking Channel</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>You've been invited!</Heading>
          <Text style={text}>
            {inviterName ? `${inviterName} (${inviterEmail})` : 'Someone'} has invited you to join{' '}
            <strong>{tenantName}</strong> on My Parking Channel.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={inviteUrl}>
              Accept Invitation
            </Button>
          </Section>

          <Text style={textSmall}>
            Or copy and paste this URL into your browser:
          </Text>
          <Link href={inviteUrl} style={link}>
            {inviteUrl}
          </Link>

          {expiresAt && (
            <Text style={textSmall}>
              This invitation expires on {formatDate(expiresAt)}.
            </Text>
          )}

          <Text style={footer}>
            If you didn't expect this invitation, you can safely ignore this email.
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

const textSmall = {
  color: '#666',
  fontSize: '14px',
  lineHeight: '20px',
  marginTop: '16px',
};

const buttonContainer = {
  padding: '27px 0 27px',
};

const button = {
  backgroundColor: '#556cd6',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
};

const link = {
  color: '#556cd6',
  textDecoration: 'underline',
  wordBreak: 'break-all' as const,
};

const footer = {
  color: '#666',
  fontSize: '14px',
  lineHeight: '24px',
  marginTop: '40px',
};

export default SetupInviteEmail;

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

interface BookingCancelledEmailProps {
  bookingReference: string;
  customerName: string;
  plate: string;
  startAt: string;
  endAt: string;
  refundAmount?: number;
  currency?: string;
  tenantName?: string;
}

export function BookingCancelledEmail(props: BookingCancelledEmailProps) {
  const {
    bookingReference,
    customerName,
    plate,
    startAt,
    endAt,
    refundAmount,
    currency = 'GBP',
    tenantName = 'My Parking Channel',
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

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  return (
    <Html>
      <Head />
      <Preview>Your parking booking has been cancelled - {bookingReference}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Booking Cancelled</Heading>
          <Text style={text}>
            Hi {customerName},
          </Text>
          <Text style={text}>
            Your parking booking has been cancelled. Here are the details:
          </Text>

          <Section style={section}>
            <Text style={label}>Booking Reference</Text>
            <Text style={value}>{bookingReference}</Text>
          </Section>

          <Section style={section}>
            <Text style={label}>Vehicle Registration</Text>
            <Text style={value}>{plate}</Text>
          </Section>

          <Section style={section}>
            <Text style={label}>Original Arrival</Text>
            <Text style={value}>{formatDate(startAt)}</Text>
          </Section>

          <Section style={section}>
            <Text style={label}>Original Departure</Text>
            <Text style={value}>{formatDate(endAt)}</Text>
          </Section>

          {refundAmount !== undefined && refundAmount > 0 && (
            <Section style={section}>
              <Text style={label}>Refund Amount</Text>
              <Text style={value}>{formatCurrency(refundAmount, currency)}</Text>
              <Text style={textSmall}>
                Your refund will be processed within 5-10 business days.
              </Text>
            </Section>
          )}

          <Text style={footer}>
            If you have any questions, please contact {tenantName}.
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
  marginTop: '8px',
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

const footer = {
  color: '#666',
  fontSize: '14px',
  lineHeight: '24px',
  marginTop: '40px',
};

export default BookingCancelledEmail;

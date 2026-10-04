import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'

export type ReserveReportData = {
  periodLabel: string
  month: string
  issuedAt: string
  reserveEUR: string
  supplyVEZ: string
  ratio: string
  status: string
  chainId: number
  rpc: string
  vezProxy: string
  oracle: string
  custodian: string
  blockNumber?: string
  roundId?: string
  note?: string
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#0a0a0a',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#e0dbdd',
    paddingBottom: 16,
  },
  brand: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#5c5c5c',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#5c5c5c',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 9,
    letterSpacing: 0.8,
    color: '#5c5c5c',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  heroBox: {
    backgroundColor: '#f7f5f6',
    borderRadius: 6,
    padding: 16,
    marginBottom: 8,
  },
  heroLabel: {
    fontSize: 9,
    color: '#5c5c5c',
    marginBottom: 4,
  },
  heroValue: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
  },
  heroUnit: {
    fontSize: 11,
    color: '#5c5c5c',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  col: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderRadius: 6,
    padding: 12,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eeeeee',
  },
  kvKey: {
    color: '#5c5c5c',
    fontSize: 9,
    width: '32%',
  },
  kvVal: {
    fontSize: 9,
    width: '68%',
    textAlign: 'right',
    fontFamily: 'Courier',
  },
  paragraph: {
    fontSize: 9,
    lineHeight: 1.45,
    color: '#333333',
    marginBottom: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 36,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: '#e0dbdd',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#888888',
  },
})

export function ReserveReportDocument({ data }: { data: ReserveReportData }) {
  return (
    <Document
      title={`VEZ Reserve Attestation — ${data.periodLabel}`}
      author="Vyft"
      subject="Monthly Proof of Reserves attestation"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>Vyft · VEZ Stablecoin</Text>
          <Text style={styles.title}>Monthly Reserve Attestation</Text>
          <Text style={styles.subtitle}>
            {data.periodLabel} · Issued {data.issuedAt}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.heroBox}>
            <Text style={styles.heroLabel}>Total reserves</Text>
            <Text style={styles.heroValue}>
              {data.reserveEUR} <Text style={styles.heroUnit}>EUR</Text>
            </Text>
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.heroLabel}>Collateralization</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>
                {data.ratio}%
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.heroLabel}>Total supply</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>
                {data.supplyVEZ} VEZ
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.heroLabel}>Status</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>
                {data.status}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>On-chain sources</Text>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Network</Text>
            <Text style={styles.kvVal}>Slura · chainId {data.chainId}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>RPC</Text>
            <Text style={styles.kvVal}>{data.rpc}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>VEZ proxy</Text>
            <Text style={styles.kvVal}>{data.vezProxy}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Oracle (EAC)</Text>
            <Text style={styles.kvVal}>{data.oracle}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Custodian</Text>
            <Text style={styles.kvVal}>{data.custodian}</Text>
          </View>
          {data.blockNumber ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Block</Text>
              <Text style={styles.kvVal}>{data.blockNumber}</Text>
            </View>
          ) : null}
          {data.roundId ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Oracle round</Text>
              <Text style={styles.kvVal}>{data.roundId}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attestation scope</Text>
          <Text style={styles.paragraph}>
            This statement summarizes VEZ circulating supply against EUR reserve
            data published by the on-chain EAC aggregator (latestRoundData) on
            Slura at the time of issuance. VEZ is designed to maintain a 1:1
            relationship with reported EUR reserves.
          </Text>
          <Text style={styles.paragraph}>
            Live Proof of Reserves complements this monthly disclosure. Figures
            may change as new oracle rounds and mints are processed.
          </Text>
          {data.note ? (
            <Text style={styles.paragraph}>Note: {data.note}</Text>
          ) : null}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>VEZ · Monthly Reserve Attestation</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}

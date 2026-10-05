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
  issuer?: string
  network?: string
  summaryFr?: string
  summaryEn?: string
}

const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#0a0a0a',
    backgroundColor: '#e0dbdd',
  },
  shell: {
    margin: 24,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(10,10,10,0.08)',
    overflow: 'hidden',
  },
  header: {
    paddingTop: 28,
    paddingBottom: 18,
    paddingHorizontal: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e2e3',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  brand: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#4b5563',
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
  },
  live: {
    fontSize: 8,
    color: '#0f7a4a',
    backgroundColor: '#ecfdf5',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  title: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 10,
    color: '#5c5c5c',
  },
  content: {
    padding: 24,
  },
  hero: {
    padding: 18,
    backgroundColor: '#f7f5f6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#efe8e9',
    marginBottom: 16,
  },
  heroLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    color: '#5c5c5c',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 30,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: -1,
  },
  heroUnit: {
    fontSize: 12,
    color: '#5c5c5c',
    fontFamily: 'Helvetica',
  },
  heroMeta: {
    fontSize: 9,
    color: '#5c5c5c',
    marginTop: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  metricLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    color: '#5c5c5c',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: -0.4,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 9,
    letterSpacing: 1.2,
    color: '#5c5c5c',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  kvGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kvCard: {
    width: '48%',
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    padding: 10,
  },
  kvKey: {
    fontSize: 8,
    color: '#5c5c5c',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  kvVal: {
    fontSize: 9,
    color: '#171717',
    fontFamily: 'Courier',
  },
  paragraph: {
    fontSize: 9,
    lineHeight: 1.55,
    color: '#282828',
    marginBottom: 8,
  },
  note: {
    fontSize: 8,
    color: '#5c5c5c',
    marginTop: 8,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#ece6e7',
    paddingTop: 10,
    paddingBottom: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  footerText: {
    fontSize: 8,
    color: '#666666',
  },
})

export function ReserveReportDocument({ data }: { data: ReserveReportData }) {
  const issuer = data.issuer || 'Vyft Ltd'
  const network = data.network || 'Slura Charène'
  const summary = data.summaryEn ||
    'This attestation confirms that the reserve assets held by Vyft Ltd support the circulating supply of VEZ on the Slura Charène network with prudent treasury coverage.'

  return (
    <Document
      title={`VEZ Reserve Attestation — ${data.periodLabel}`}
      author={issuer}
      subject="Monthly Proof of Reserves attestation"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.shell}>
          <View style={styles.header}>
            <View style={styles.topBar}>
              <View style={styles.brandWrap}>
                <View style={styles.logoBox}>
                  <Text style={styles.logoText}>V</Text>
                </View>
                <Text style={styles.brand}>VEZ</Text>
              </View>
              <Text style={styles.live}>Live</Text>
            </View>
            <Text style={styles.title}>Reserve Attestation</Text>
            <Text style={styles.subtitle}>
              {data.periodLabel} · Issued {data.issuedAt} · {issuer} · {network}
            </Text>
          </View>

          <View style={styles.content}>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Total reserves</Text>
              <Text style={styles.heroValue}>
                {data.reserveEUR} <Text style={styles.heroUnit}>EUR</Text>
              </Text>
              <Text style={styles.heroMeta}>
                {data.issuedAt} · Slura {data.chainId ?? 45057}
              </Text>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Coverage</Text>
                <Text style={styles.metricValue}>{data.ratio}%</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Supply</Text>
                <Text style={styles.metricValue}>{data.supplyVEZ}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Status</Text>
                <Text style={styles.metricValue}>{data.status}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Key details</Text>
              <View style={styles.kvGrid}>
                <View style={styles.kvCard}>
                  <Text style={styles.kvKey}>Issuer</Text>
                  <Text style={styles.kvVal}>{issuer}</Text>
                </View>
                <View style={styles.kvCard}>
                  <Text style={styles.kvKey}>Network</Text>
                  <Text style={styles.kvVal}>{network}</Text>
                </View>
                <View style={styles.kvCard}>
                  <Text style={styles.kvKey}>Oracle</Text>
                  <Text style={styles.kvVal}>{data.oracle}</Text>
                </View>
                <View style={styles.kvCard}>
                  <Text style={styles.kvKey}>Custodian</Text>
                  <Text style={styles.kvVal}>{data.custodian}</Text>
                </View>
                {data.blockNumber ? (
                  <View style={styles.kvCard}>
                    <Text style={styles.kvKey}>Block</Text>
                    <Text style={styles.kvVal}>{data.blockNumber}</Text>
                  </View>
                ) : null}
                {data.roundId ? (
                  <View style={styles.kvCard}>
                    <Text style={styles.kvKey}>Oracle round</Text>
                    <Text style={styles.kvVal}>{data.roundId}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Statement</Text>
              <Text style={styles.paragraph}>
                {data.summaryFr ||
                  'Cette attestation confirme que les réserves sous gestion par Vyft Ltd sur le réseau Slura Charène soutiennent la circulation de VEZ avec une couverture prudente et transparente.'}
              </Text>
              <Text style={styles.paragraph}>{summary}</Text>
              {data.note ? <Text style={styles.note}>{data.note}</Text> : null}
            </View>
          </View>

          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>VEZ · Reserve Disclosure</Text>
            <Text style={styles.footerText}>Vyft Ltd · Slura Charène</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

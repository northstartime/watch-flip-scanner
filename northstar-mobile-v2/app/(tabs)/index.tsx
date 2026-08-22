import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type Opportunity = {
  id: number | string;
  brand: string | null;
  title: string;
  price: number | null;
  marketValue: number | null;
  projectedProfit: number | null;
  score: number;
  source: string;
  decision: string;
  url: string;
  image: string | null;
};

type HealthResponse = {
  ok: boolean;
  count: number;
  updatedAt: string | null;
};

const API_URL = (
  process.env.EXPO_PUBLIC_NORTH_STAR_API_URL ||
  'https://watch-flip-scanner.onrender.com'
).replace(/\/$/, '');

export default function HomeScreen() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null);

  async function loadOpportunities() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_URL}/api/opportunities?t=${Date.now()}`,
        { headers: { Accept: 'application/json' } }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: Opportunity[] = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('The cloud returned an invalid opportunities list.');
      }

      setOpportunities(data);

      const healthResponse = await fetch(
        `${API_URL}/api/health?t=${Date.now()}`,
        { headers: { Accept: 'application/json' } }
      );

      if (healthResponse.ok) {
        const health: HealthResponse = await healthResponse.json();
        setCloudUpdatedAt(health.updatedAt);
      }
    } catch (err) {
      console.log('FETCH ERROR:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reach the North Star cloud.'
      );
    } finally {
      setLoading(false);
    }
  }

useEffect(() => {
  loadOpportunities();
}, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <ThemedText type="title">
        ⭐ North Star Intelligence
      </ThemedText>

      <ThemedText style={styles.subtitle}>
        Professional Watch Intelligence
      </ThemedText>

      <ThemedText style={styles.cloudStatus}>
        {cloudUpdatedAt
          ? `Cloud updated ${new Date(cloudUpdatedAt).toLocaleString()}`
          : 'Waiting for the first cloud scan'}
      </ThemedText>

      <Pressable
        style={styles.refreshButton}
        onPress={loadOpportunities}
      >
      {loading ? (
  <ActivityIndicator color="#FFFFFF" />
) : (
  <ThemedText style={styles.buttonText}>
    Refresh Opportunities
  </ThemedText>
)}
      </Pressable>

      {loading ? (
        <ThemedText>Loading...</ThemedText>
      ) : error ? (
        <ThemedView style={styles.errorCard}>
          <ThemedText style={styles.errorTitle}>
            Cloud connection problem
          </ThemedText>
          <ThemedText>{error}</ThemedText>
          <ThemedText style={styles.errorHelp}>
            Tap Refresh Opportunities to try again.
          </ThemedText>
        </ThemedView>
      ) : opportunities.length === 0 ? (
        <ThemedView style={styles.card}>
          <ThemedText>No opportunities found.</ThemedText>
        </ThemedView>
      ) : (
        opportunities.map((item, index) => (
<ThemedView
  key={item.id ?? index}
  style={styles.card}
>
  {item.image ? (
    <Image
     source={{
  uri:
    item.source === "Moda"
      ? `${API_URL}/api/image-proxy?url=${encodeURIComponent(item.image)}`
      : item.image,
}}
      style={styles.watchImage}
      onError={(e) =>
        console.log(
          "IMAGE ERROR:",
          item.source,
          e.nativeEvent.error,
          item.image
        )
      }
    />
  ) : null}

  <ThemedText style={styles.title}>
    {item.title}
  </ThemedText>

            <ThemedText>
              📍 Source: {item.source}
            </ThemedText>

            <ThemedText>
           💵 Asking:{' '}
{item.price == null
  ? 'Manual Review'
  : `$${item.price.toLocaleString()}`}
            </ThemedText>

            <ThemedText>
           📈 Market:{' '}
{item.marketValue == null
  ? 'Manual Review'
  : `$${item.marketValue.toLocaleString()}`}
            </ThemedText>

            <ThemedText
              style={[
                styles.profit,
                {
                  color:
                    (item.projectedProfit ?? 0) >= 0
                      ? '#4CAF50'
                      : '#FF5252',
                },
              ]}
            >
            💰 Profit:{' '}
{item.projectedProfit == null
  ? 'Manual Review'
  : `$${item.projectedProfit.toLocaleString()}`}
            </ThemedText>

            <ThemedText
              style={[
                styles.score,
                {
                  color:
                    item.score >= 80
                      ? '#4CAF50'
                      : item.score >= 60
                      ? '#FFC107'
                      : '#FF5252',
                },
              ]}
            >
              ⭐ North Star Score: {item.score}
            </ThemedText>

            <ThemedText>
              Decision: {item.decision}
            </ThemedText>

            <Pressable
              style={styles.button}
            onPress={() =>
  router.push({
    pathname: '/opportunity',
params: {
  title: item.title,
price: String(item.price ?? 0),
marketValue: String(item.marketValue ?? 0),
projectedProfit: String(item.projectedProfit ?? 0),
score: String(item.score ?? 0),
  decision: item.decision,
  source: item.source,
  url: item.url,
  image: item.image ?? '',
},
  })
}
            >
  <ThemedText style={styles.buttonText}>
  🌐 View Opportunity
</ThemedText>
            </Pressable>
          </ThemedView>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0B',
  },

  content: {
    padding: 24,
    alignItems: 'center',
    paddingBottom: 50,
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 6,
    textAlign: 'center',
  },

  cloudStatus: {
    marginBottom: 20,
    textAlign: 'center',
    color: '#9CA3AF',
  },

  refreshButton: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#2F6FED',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    alignItems: 'center',
  },

  card: {
    width: '100%',
    maxWidth: 340,
    padding: 22,
    borderRadius: 18,
    marginBottom: 20,
    backgroundColor: '#181818',
    borderColor: '#2F6FED',
    borderWidth: 2,
  },

  errorCard: {
    width: '100%',
    maxWidth: 340,
    padding: 22,
    borderRadius: 18,
    backgroundColor: '#2A1515',
    borderColor: '#FF5252',
    borderWidth: 2,
  },

  errorTitle: {
    color: '#FF7777',
    fontWeight: '700',
    marginBottom: 8,
  },

  errorHelp: {
    marginTop: 8,
    color: '#D1D5DB',
  },

  title: {
    fontSize: 20,
    marginBottom: 12,
  },

  profit: {
    fontWeight: '700',
    marginTop: 6,
  },

  score: {
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 6,
  },
watchImage: {
  width: '100%',
  height: 220,
  borderRadius: 12,
  marginBottom: 14,
  resizeMode: 'contain',
},
  button: {
    marginTop: 18,
    backgroundColor: '#C8A44D',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },

  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

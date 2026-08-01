import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type Opportunity = {
  id: number;
  brand: string;
  title: string;
  price: number;
  marketValue: number;
  projectedProfit: number;
  score: number;
  source: string;
  decision: string;
  url: string;
image: string;
};

export default function HomeScreen() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadOpportunities() {
    try {
      setLoading(true);

  const response = await fetch(
  "https://watch-flip-scanner.onrender.com/api/opportunities"
);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("DATA:", data);
console.log("COUNT:", data.length);

      setOpportunities(data);
    } catch (err) {
      console.log(err);
    console.log('FETCH ERROR:', err);

if (err instanceof Error) {
  alert(err.message);
} else {
  alert(JSON.stringify(err));
}
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

      <Pressable
        style={styles.refreshButton}
        onPress={loadOpportunities}
      >
        <ThemedText style={styles.buttonText}>
          Refresh Opportunities
        </ThemedText>
      </Pressable>

      {loading ? (
        <ThemedText>Loading...</ThemedText>
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
            <Image
  source={{ uri: item.image }}
  style={styles.watchImage}
/>
            <ThemedText
             
              style={styles.title}
            >
              {item.title}
            </ThemedText>

            <ThemedText>
              📍 Source: {item.source}
            </ThemedText>

            <ThemedText>
              💵 Asking: ${item.price.toLocaleString()}
            </ThemedText>

            <ThemedText>
              📈 Market: ${item.marketValue.toLocaleString()}
            </ThemedText>

            <ThemedText
              style={[
                styles.profit,
                {
                  color:
                    item.projectedProfit >= 0
                      ? '#4CAF50'
                      : '#FF5252',
                },
              ]}
            >
              💰 Profit: $
              {item.projectedProfit.toLocaleString()}
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
  price: item.price.toString(),
  marketValue: item.marketValue.toString(),
  projectedProfit: item.projectedProfit.toString(),
  score: item.score.toString(),
  decision: item.decision,
  source: item.source,
  url: item.url,
  image: item.image,
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
    marginBottom: 20,
    textAlign: 'center',
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
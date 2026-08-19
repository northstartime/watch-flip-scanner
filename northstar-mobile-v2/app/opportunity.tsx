import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function OpportunityScreen() {
  const {
    title,
    price,
    marketValue,
    projectedProfit,
    score,
    decision,
    source,
    url,
    image,
  } = useLocalSearchParams();

  const decisionColor =
    decision === 'BUY'
      ? '#4CAF50'
      : decision === 'HOLD'
      ? '#FFC107'
      : '#FF5252';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {typeof image === 'string' && image.length > 0 && (
        <Image source={{ uri: image }} style={styles.image} />
      )}

      <ThemedText type="title" style={styles.title}>
        {title || 'Unknown Watch'}
      </ThemedText>

      <ThemedText style={[styles.decision, { color: decisionColor }]}>
        {decision}
      </ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText>Asking Price</ThemedText>
        <ThemedText type="defaultSemiBold">
       {price != null ? `$${Number(price).toLocaleString()}` : "Manual Review"}
        </ThemedText>

        <ThemedText style={styles.spacing}>Market Value</ThemedText>
        <ThemedText type="defaultSemiBold">
        {marketValue != null
  ? `$${Number(marketValue).toLocaleString()}`
  : "Manual Review"}
        </ThemedText>

        <ThemedText style={styles.spacing}>Projected Profit</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.green}>
     {projectedProfit != null
  ? `$${Number(projectedProfit).toLocaleString()}`
  : "Manual Review"}
        </ThemedText>

        <ThemedText style={styles.spacing}>North Star Score</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.green}>
          {score}
        </ThemedText>

        <ThemedText style={styles.spacing}>Source</ThemedText>
        <ThemedText>{source}</ThemedText>
      </ThemedView>

      <Pressable
        style={styles.goldButton}
onPress={() => {
  if (typeof url === 'string' && url.length > 0) {
    if (source === 'Moda') {
      Linking.openURL(url);
    } else {
      WebBrowser.openBrowserAsync(url);
    }
  }
}}
      >
        <ThemedText style={styles.buttonText}>
          🌐 Open Original Listing
        </ThemedText>
      </Pressable>

      <Pressable
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <ThemedText style={styles.buttonText}>
          ← Back to Opportunities
        </ThemedText>
      </Pressable>
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
    paddingBottom: 40,
  },

  image: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 20,
  },

  title: {
    marginBottom: 8,
  },

  decision: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 20,
  },

  card: {
    backgroundColor: '#181818',
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: '#2F6FED',
    marginBottom: 24,
  },

  spacing: {
    marginTop: 12,
  },

  green: {
    color: '#4CAF50',
  },

  goldButton: {
    backgroundColor: '#C8A44D',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },

  backButton: {
    backgroundColor: '#2F6FED',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },

  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
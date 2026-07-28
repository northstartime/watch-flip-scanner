import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

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
} = useLocalSearchParams(); 
  return (
    <ThemedView style={styles.container}>

      <ThemedText type="title">
        Rolex Explorer II
      </ThemedText>

      <ThemedText style={styles.buy}>
        🟢 BUY
      </ThemedText>

      <ThemedView style={styles.card}>

        <ThemedText>
          Asking Price
        </ThemedText>

        <ThemedText type="defaultSemiBold">
          $6,999
        </ThemedText>

        <ThemedText>
          Market Value
        </ThemedText>

        <ThemedText type="defaultSemiBold">
          $8,200
        </ThemedText>

        <ThemedText>
          Projected Profit
        </ThemedText>

        <ThemedText
          type="defaultSemiBold"
          style={styles.green}
        >
          +$866
        </ThemedText>

        <ThemedText>
          North Star Score
        </ThemedText>

        <ThemedText
          type="defaultSemiBold"
          style={styles.green}
        >
          ★★★★☆ 86
        </ThemedText>

        <ThemedText>
          Source
        </ThemedText>

        <ThemedText>
          eBay
        </ThemedText>

      </ThemedView>

      <Pressable
        style={styles.button}
        onPress={() => router.push('/evaluate')}
      >
        <ThemedText style={styles.buttonText}>
          Review with ChatGPT
        </ThemedText>
      </Pressable>

      <Pressable
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <ThemedText style={styles.buttonText}>
          ← Back
        </ThemedText>
      </Pressable>

    </ThemedView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#0B0B0B',
    padding: 24,
    justifyContent: 'center',
  },

  card: {
    backgroundColor: '#181818',
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: '#2F6FED',
    gap: 8,
    marginVertical: 24,
  },

  buy: {
    color: '#4CAF50',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
  },

  green: {
    color: '#4CAF50',
  },

  button: {
    backgroundColor: '#C8A44D',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 14,
  },

  backButton: {
    backgroundColor: '#2F6FED',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },

  buttonText: {
    color: 'white',
    fontWeight: '700',
  },

});
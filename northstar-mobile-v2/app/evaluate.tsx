import { StyleSheet, TextInput, Pressable } from 'react-native';
import { useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function EvaluateScreen() {
  const [listing, setListing] = useState('');

  return (
    <ThemedView style={styles.container}>

     <ThemedText type="title">
  North Star Intelligence
</ThemedText>

<ThemedText type="subtitle">
  Evaluate Listing
</ThemedText>

      <TextInput
        style={styles.input}
        multiline
        placeholder="Paste a Moda listing here..."
        value={listing}
        onChangeText={setListing}
      />

      <Pressable style={styles.button}>
        <ThemedText style={styles.buttonText}>
          Evaluate
        </ThemedText>
      </Pressable>

      <ThemedView style={styles.results}>
        <ThemedText type="defaultSemiBold">
          Results
        </ThemedText>

        <ThemedText>
          North Star Score: --
        </ThemedText>

        <ThemedText>
          Decision: --
        </ThemedText>

        <ThemedText>
          Profit: --
        </ThemedText>
      </ThemedView>

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 20,
  },

  input: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 12,
    padding: 16,
    textAlignVertical: 'top',
  },

  button: {
    backgroundColor: '#C8A44D',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },

  buttonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 18,
  },

  results: {
    padding: 20,
    borderRadius: 12,
    gap: 10,
  },
});
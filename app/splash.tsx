import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SnowEffect } from "@/components/snow-effect";

export default function SplashScreen() {
  const router = useRouter();
  const [showSnow, setShowSnow] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    // Mostra lo spinner per 2 secondi
    const spinnerTimer = setTimeout(() => {
      setShowSnow(true);
    }, 2000);

    // Dopo 5 secondi (2 spinner + 3 neve), mostra il contenuto
    const contentTimer = setTimeout(() => {
      setShowContent(true);
    }, 5000);

    // Dopo 7 secondi totali, naviga alla home
    const navigateTimer = setTimeout(() => {
      router.replace("/(tabs)");
    }, 7000);

    return () => {
      clearTimeout(spinnerTimer);
      clearTimeout(contentTimer);
      clearTimeout(navigateTimer);
    };
  }, [router]);

  return (
    <View style={styles.container}>
      {!showSnow && (
        <View style={styles.spinnerContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={styles.loadingText}>Caricamento...</Text>
        </View>
      )}
      {showSnow && (
        <>
          <View style={styles.snowContainer}>
            {showContent && (
              <View style={styles.contentContainer}>
                <Text style={styles.welcomeText}>Benvenuto!</Text>
                <Text style={styles.appName}>Journey Finder</Text>
              </View>
            )}
          </View>
          <SnowEffect />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#C41E3A",
    justifyContent: "center",
    alignItems: "center",
  },
  spinnerContainer: {
    alignItems: "center",
    gap: 20,
  },
  loadingText: {
    color: "#FFF8DC",
    fontSize: 18,
    fontWeight: "600",
  },
  snowContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  contentContainer: {
    alignItems: "center",
    gap: 16,
    zIndex: 1001,
  },
  welcomeText: {
    color: "#FFF8DC",
    fontSize: 32,
    fontWeight: "700",
    textShadowColor: "#D4AF37",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  appName: {
    color: "#D4AF37",
    fontSize: 28,
    fontWeight: "800",
    textShadowColor: "#FFF8DC",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});


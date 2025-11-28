import { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

interface Snowflake {
  id: number;
  left: number;
  duration: number;
  delay: number;
  size: number;
  translateY: Animated.Value;
  opacity: Animated.Value;
  rotate: Animated.Value;
}

const SNOWFLAKE_COUNT = 50;

export function SnowEffect() {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

  useEffect(() => {
    // Genera fiocchi di neve con le loro animazioni
    const flakes: Snowflake[] = Array.from({ length: SNOWFLAKE_COUNT }, (_, i) => {
      const translateY = new Animated.Value(0);
      const opacity = new Animated.Value(0);
      const rotate = new Animated.Value(0);

      return {
        id: i,
        left: Math.random() * 100,
        duration: 3000 + Math.random() * 4000,
        delay: Math.random() * 2000,
        size: 8 + Math.random() * 12,
        translateY,
        opacity,
        rotate,
      };
    });

    setSnowflakes(flakes);

    // Avvia le animazioni per ogni fiocco
    flakes.forEach((flake) => {
      // Animazione translateY
      Animated.loop(
        Animated.sequence([
          Animated.delay(flake.delay),
          Animated.timing(flake.translateY, {
            toValue: 1,
            duration: flake.duration,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Animazione opacity
      Animated.loop(
        Animated.sequence([
          Animated.delay(flake.delay),
          Animated.timing(flake.opacity, {
            toValue: 1,
            duration: flake.duration / 2,
            useNativeDriver: true,
          }),
          Animated.timing(flake.opacity, {
            toValue: 0,
            duration: flake.duration / 2,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Animazione rotate
      Animated.loop(
        Animated.sequence([
          Animated.delay(flake.delay),
          Animated.timing(flake.rotate, {
            toValue: 1,
            duration: flake.duration,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {snowflakes.map((flake) => {
        const translateY = flake.translateY.interpolate({
          inputRange: [0, 1],
          outputRange: [-100, 1000],
        });

        const opacity = flake.opacity;

        const rotate = flake.rotate.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "360deg"],
        });

        return (
          <Animated.View
            key={flake.id}
            style={[
              styles.snowflake,
              {
                left: `${flake.left}%`,
                width: flake.size,
                height: flake.size,
                transform: [{ translateY }, { rotate }],
                opacity,
              },
            ]}
          >
            <View style={[styles.snowflakeInner, { width: flake.size, height: flake.size }]} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  snowflake: {
    position: "absolute",
    top: -50,
  },
  snowflakeInner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 50,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
  },
});


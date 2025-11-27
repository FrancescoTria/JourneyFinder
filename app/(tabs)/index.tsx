// Imports core UI primitives, hooks, and vector icons used to build the mocked homepage.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { supabase } from "../../lib/supabase";

// Renders the fully styled "Journey Finder" homepage matching the provided design.
export default function HomeScreen() {
  // Stores the selected departure date used as an additional search criterion.
  // By default this is set to "today" so the initial picker value matches the current day.
  const [departureDate, setDepartureDate] = useState<Date | null>(new Date());

  // Keeps track of the departure and arrival stops typed by the user.
  const [departureStop, setDepartureStop] = useState("");
  const [arrivalStop, setArrivalStop] = useState("");
  // Full list of stops loaded from the "fermate" table on Supabase.
  const [stops, setStops] = useState<any[]>([]);
  // Tracks which stop field is currently focused, so we know which suggestions to show.
  const [activeStopField, setActiveStopField] = useState<
    "departure" | "arrival" | null
  >(null);
  // Basic loading / error state for the stop suggestions.
  const [loadingStops, setLoadingStops] = useState(false);
  const [stopsError, setStopsError] = useState<string | null>(null);
  // Ref to the ScrollView so we can programmatically scroll when suggestions appear.
  const scrollViewRef = useRef<ScrollView>(null);
  // Ref to measure the position of the stop inputs container.
  const stopInputsRef = useRef<View>(null);
  // Stores the Y position of the stop inputs container for scrolling.
  const [stopInputsY, setStopInputsY] = useState(0);

  // Formats dates in the "Aug 5, 2024" style while handling null values gracefully.
  const formatDate = useCallback((date: Date | null) => {
    if (!date) return "Select date";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }, []);

  // Memoized string keeps the render tree clean and avoids recalculating formatting logic.
  const departureLabel = useMemo(
    () => formatDate(departureDate),
    [departureDate, formatDate]
  );

  // Loads all stops from the "fermate" table once, used as suggestions for the selects.
  useEffect(() => {
    const fetchStops = async () => {
      try {
        setLoadingStops(true);
        setStopsError(null);

        const { data, error } = await supabase
          .from("fermate")
          .select("*")
          .order("nome", { ascending: true });

        if (error) {
          throw error;
        }

        setStops(data ?? []);
      } catch (error: any) {
        setStopsError(
          error.message ?? "Impossibile caricare la lista delle fermate."
        );
      } finally {
        setLoadingStops(false);
      }
    };

    fetchStops();
  }, []);

  // Returns the display name for a single stop record, trying a few common column names.
  const getStopName = useCallback((stop: any) => {
    return (
      stop?.nome ??
      stop?.nome_fermata ??
      stop?.stazione ??
      stop?.descrizione ??
      ""
    );
  }, []);

  // Computes suggestions based on the active input (departure/arrival) and its current text.
  const stopSuggestions = useMemo(() => {
    if (!activeStopField) return [];

    const term = (activeStopField === "departure" ? departureStop : arrivalStop)
      .trim()
      .toLowerCase();

    if (!term) {
      // Show the first handful of stops when the field is empty.
      return stops.slice(0, 8);
    }

    return stops
      .filter((stop) => String(getStopName(stop)).toLowerCase().includes(term))
      .slice(0, 8);
  }, [activeStopField, arrivalStop, departureStop, getStopName, stops]);

  // Opens the native date picker (platform specific) for the departure date.
  const openDeparturePicker = useCallback(() => {
    const today = new Date();
    const currentDate =
      departureDate && departureDate <= today ? departureDate : today;

    DateTimePickerAndroid.open({
      value: currentDate,
      mode: "date",
      maximumDate: today, // Do not allow selecting dates in the future
      onChange: (_, selectedDate) => {
        if (!selectedDate) return;
        setDepartureDate(selectedDate);
      },
    });
  }, [departureDate]);

  // Automatically scrolls to show the suggestions when a stop field is focused.
  useEffect(() => {
    if (activeStopField && stopSuggestions.length > 0 && stopInputsY > 0) {
      // Small delay to ensure the suggestions have rendered.
      setTimeout(() => {
        // Calculate scroll position to show the field and all suggestions
        const suggestionsHeight = Math.min(stopSuggestions.length * 50, 200);
        // Scroll to show the input field with enough space below for all suggestions
        const scrollY = Math.max(0, stopInputsY - 80 + suggestionsHeight);

        scrollViewRef.current?.scrollTo({
          y: scrollY,
          animated: true,
        });
      }, 150);
    }
  }, [activeStopField, stopSuggestions.length, stopInputsY]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Provides the light grey background and centers the hero card on screen */}
          <View style={styles.screenContainer}>
            {/* Dark hero card that houses the historical journey search UI */}
            <View
              style={[
                styles.card,
                activeStopField &&
                  stopSuggestions.length > 0 &&
                  styles.cardWithSuggestions,
              ]}
            >
              {/* Header row with the train icon and title */}
              <View>
                <View style={styles.cardHeader}>
                  <View style={styles.iconBadge}>
                    <Ionicons name="train" size={20} color="#0f172a" />
                  </View>
                  <Text style={styles.cardTitle}>Journey Finder</Text>
                </View>
                <Text style={styles.cardSubtitle}>
                  Historical Journey Search
                </Text>
                <Text style={styles.cardBody}>
                  Use the filters below to find and analyze past train journeys.
                </Text>
              </View>

              {/* Departure date selector used as an additional search criterion */}
              <View style={[styles.formGroup, styles.dateGroup]}>
                <Text style={styles.formLabel}>Departure date</Text>
                <TouchableOpacity
                  style={styles.datePicker}
                  onPress={openDeparturePicker}
                >
                  <Ionicons name="calendar" size={18} color="#e2e8f0" />
                  <View style={styles.dateTextWrapper}>
                    <Text style={styles.dateLabel}>Departure</Text>
                    <Text style={styles.dateText}>{departureLabel}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              {/* Search input block with magnifier icon and departure/arrival stops */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Search by Stops</Text>

                {/* Container keeps the suggestion dropdown positioned over the card, not pushing layout */}
                <View
                  ref={stopInputsRef}
                  onLayout={(event) => {
                    const { y } = event.nativeEvent.layout;
                    setStopInputsY(y);
                  }}
                >
                  {/* Row with two inputs: one for departure stop and one for arrival stop */}
                  <View style={styles.stopRow}>
                    {/* Departure stop input with leading location icon */}
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Departure"
                        placeholderTextColor="#94a3b8"
                        value={departureStop}
                        onChangeText={setDepartureStop}
                        onFocus={() => setActiveStopField("departure")}
                        // When focus is lost, hide suggestions so they don't block other tap targets.
                        onBlur={() => setActiveStopField(null)}
                      />
                    </View>

                    {/* Arrival stop input with leading flag icon */}
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Arrival"
                        placeholderTextColor="#94a3b8"
                        value={arrivalStop}
                        onChangeText={setArrivalStop}
                        onFocus={() => setActiveStopField("arrival")}
                        // When focus is lost, hide suggestions so they don't block other tap targets.
                        onBlur={() => setActiveStopField(null)}
                      />
                    </View>
                  </View>

                  {/* Inline suggestion list behaving like a select dropdown, overlaying background */}
                  {activeStopField && stopSuggestions.length > 0 && (
                    <View style={styles.suggestionBox}>
                      {stopSuggestions.map((stop: any, index: number) => {
                        const name = String(getStopName(stop));
                        return (
                          <TouchableOpacity
                            key={`${name}-${index}`}
                            style={styles.suggestionItem}
                            onPress={() => {
                              if (activeStopField === "departure") {
                                setDepartureStop(name);
                              } else {
                                setArrivalStop(name);
                              }
                              setActiveStopField(null);
                            }}
                          >
                            <Text style={styles.suggestionText}>{name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Shows a small helper text when stop suggestions fail to load */}
                {stopsError && (
                  <Text style={styles.errorText}>{stopsError}</Text>
                )}
              </View>

              {/* Primary call-to-action button (per ora è solo estetico, senza logica di backend) */}
              <TouchableOpacity style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Search</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Centralized styles keep the JSX focused on structure while matching the screenshot spacing/colors.
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // Deep blue background gives more contrast and a premium dashboard feel.
    backgroundColor: "#020617",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  screenContainer: {
    flex: 1,
    padding: 17,
    backgroundColor: "#BBC1D9",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100%",
  },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 28,
    padding: 28,
    gap: 24,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
    width: "100%",
    maxWidth: 420,
  },
  cardWithSuggestions: {
    paddingBottom: 250, // Extra padding when suggestions are visible to ensure they're fully shown
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#38bdf8",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
  },
  cardSubtitle: {
    color: "#f8fafc",
    fontSize: 21,
    fontWeight: "800",
  },
  cardBody: {
    paddingTop: 10,
    color: "#cbd5f5",
    fontSize: 15,
    lineHeight: 22,
  },
  formGroup: {
    gap: 8,
  },
  // Ensures the date selector is visually grouped and aligned with the other fields.
  dateGroup: {
    marginBottom: 4,
  },
  // Wraps the two stop inputs so they sit side–by–side and stay aligned.
  stopRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "nowrap",
    width: "100%",
  },
  formLabel: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  inputRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0b1220",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 14,
    height: 56,
    gap: 10,
  },
  textInput: {
    flex: 1,
    color: "#f8fafc",
    fontSize: 15,
  },
  datePicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 14,
    height: 56,
    marginTop: 4,
  },
  dateTextWrapper: {
    flex: 1,
    marginLeft: 12,
  },
  dateLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 2,
  },
  dateText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "700",
  },
  suggestionBox: {
    position: "absolute",
    top: 64,
    left: 0,
    right: 0,
    backgroundColor: "#020617",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    maxHeight: 200,
    overflow: "hidden",
    zIndex: 20,
    elevation: 20,
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  suggestionText: {
    color: "#e5e7eb",
    fontSize: 14,
  },
  resultsContainer: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    paddingTop: 16,
    gap: 8,
  },
  resultRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  resultTitle: {
    color: "#e5e7eb",
    fontSize: 15,
    fontWeight: "600",
  },
  resultSubtitle: {
    color: "#9ca3af",
    fontSize: 13,
    marginTop: 2,
  },
  errorText: {
    marginTop: 12,
    color: "#f87171",
    fontSize: 13,
  },
});

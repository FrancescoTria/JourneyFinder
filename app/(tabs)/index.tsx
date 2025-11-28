// Imports core UI primitives, hooks, and vector icons used to build the mocked homepage.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

type StopRecord = {
  id: number;
  nome?: string;
  nome_fermata?: string;
  stazione?: string;
  descrizione?: string;
  [key: string]: any;
};

type PercorsoFermataRecord = {
  id_percorso: number;
  id_fermata: number;
  ordine: number;
};

// Renders the fully styled "Journey Finder" homepage matching the provided design.
export default function HomeScreen() {
  // Stores the selected departure date used as an additional search criterion.
  // By default this is set to "today" so the initial picker value matches the current day.
  const [departureDate, setDepartureDate] = useState<Date | null>(new Date());

  // Router for navigation
  const router = useRouter();

  // Keeps track of the departure and arrival stops typed by the user.
  const [departureStop, setDepartureStop] = useState("");
  const [arrivalStop, setArrivalStop] = useState("");
  // Selected departure stop once the user taps a suggestion.
  const [selectedDeparture, setSelectedDeparture] = useState<StopRecord | null>(
    null
  );
  // Selected arrival stop once the user taps a suggestion.
  const [selectedArrival, setSelectedArrival] = useState<StopRecord | null>(
    null
  );
  // Full list of stops loaded from the "fermate" table on Supabase.
  const [stops, setStops] = useState<StopRecord[]>([]);
  // Tracks which stop field is currently focused, so we know which suggestions to show.
  const [activeStopField, setActiveStopField] = useState<
    "departure" | "arrival" | null
  >(null);
  // Basic loading / error state for the stop suggestions.
  const [loadingStops, setLoadingStops] = useState(false);
  const [stopsError, setStopsError] = useState<string | null>(null);
  // List of arrival suggestions tied to the selected departure stop.
  const [arrivalOptions, setArrivalOptions] = useState<StopRecord[]>([]);
  const [loadingArrivalOptions, setLoadingArrivalOptions] = useState(false);
  const [arrivalOptionsError, setArrivalOptionsError] = useState<string | null>(
    null
  );
  // Ref to the ScrollView so we can programmatically scroll when suggestions appear.
  const scrollViewRef = useRef<ScrollView>(null);
  // Ref to measure the position of the stop inputs container.
  const stopInputsRef = useRef<View>(null);
  // Stores the Y position of the stop inputs container for scrolling.
  const [stopInputsY, setStopInputsY] = useState(0);

  // Formats dates in the "Aug 5, 2024" style while handling null values gracefully.
  const formatDate = useCallback((date: Date | null) => {
    if (!date) return "Seleziona una data";

    return new Intl.DateTimeFormat("it-IT", {
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

  // Map helpful to resolve stop metadata by id without re-filtering arrays.
  const stopsById = useMemo(() => {
    return stops.reduce((acc, stop) => {
      if (typeof stop.id === "number") {
        acc.set(stop.id, stop);
      }
      return acc;
    }, new Map<number, StopRecord>());
  }, [stops]);

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

  // Loads all valid arrival stops for a given departure by looking at percorsi_fermate.
  // Logica: per ogni percorso che passa dalla fermata di andata, trova tutte le fermate
  // dello stesso percorso con ordine maggiore rispetto a quello della fermata di andata.
  const loadArrivalOptions = useCallback(
    async (stop: StopRecord | null) => {
      if (!stop?.id) {
        setArrivalOptions([]);
        return;
      }

      try {
        setLoadingArrivalOptions(true);
        setArrivalOptionsError(null);

        // Step 1: Trova tutti i record in percorsi_fermate per la fermata di andata
        // Questo ci dà id_percorso e ordine per ogni percorso che passa da questa fermata
        const { data: departureSegments, error: departureError } =
          await supabase
            .from("percorsi_fermate")
            .select("id_percorso, ordine")
            .eq("id_fermata", stop.id);

        if (departureError) {
          throw departureError;
        }

        if (!departureSegments || departureSegments.length === 0) {
          setArrivalOptions([]);
          return;
        }

        // Step 2: Per ogni percorso trovato, cerca tutte le fermate con ordine maggiore
        const validStopIds: number[] = [];
        const seen = new Set<number>();

        for (const departureSegment of departureSegments) {
          const { id_percorso, ordine: ordineAndata } = departureSegment;

          // Trova tutte le fermate dello stesso percorso con ordine > ordineAndata
          const { data: arrivalSegments, error: arrivalError } = await supabase
            .from("percorsi_fermate")
            .select("id_fermata")
            .eq("id_percorso", id_percorso)
            .gt("ordine", ordineAndata);

          if (arrivalError) {
            throw arrivalError;
          }

          // Aggiungi le fermate trovate alla lista (evitando duplicati)
          if (arrivalSegments) {
            arrivalSegments.forEach((segment: { id_fermata: number }) => {
              if (!seen.has(segment.id_fermata)) {
                seen.add(segment.id_fermata);
                validStopIds.push(segment.id_fermata);
              }
            });
          }
        }

        // Step 3: Risolvi gli ID delle fermate con i dati completi
        const resolvedStops = validStopIds
          .map((id) => stopsById.get(id))
          .filter(Boolean) as StopRecord[];

        setArrivalOptions(resolvedStops);
      } catch (error: any) {
        setArrivalOptionsError(
          error.message ??
            "Impossibile ottenere le fermate di arrivo disponibili."
        );
        setArrivalOptions([]);
      } finally {
        setLoadingArrivalOptions(false);
      }
    },
    [stopsById]
  );

  // Handles manual edits on the departure field resetting the dependent arrival list.
  const handleDepartureTextChange = useCallback((text: string) => {
    setDepartureStop(text);
    setSelectedDeparture(null);
    setArrivalStop("");
    setSelectedArrival(null);
    setArrivalOptions([]);
    setArrivalOptionsError(null);
  }, []);

  const handleArrivalTextChange = useCallback((text: string) => {
    setArrivalStop(text);
    setSelectedArrival(null);
  }, []);

  const handleSuggestionPress = useCallback(
    (stop: StopRecord) => {
      if (!activeStopField) return;

      const stopName = String(getStopName(stop));

      if (activeStopField === "departure") {
        setDepartureStop(stopName);
        setSelectedDeparture(stop);
        setActiveStopField(null);
        setArrivalStop("");
        setArrivalOptions([]);
        setArrivalOptionsError(null);
        loadArrivalOptions(stop);
      } else {
        setArrivalStop(stopName);
        setSelectedArrival(stop);
        setActiveStopField(null);
      }
    },
    [activeStopField, getStopName, loadArrivalOptions]
  );

  // Computes suggestions based on the active input (departure/arrival) and its current text.
  const stopSuggestions = useMemo(() => {
    if (!activeStopField) return [];

    if (activeStopField === "arrival" && !selectedDeparture) {
      return [];
    }

    const source = activeStopField === "departure" ? stops : arrivalOptions;

    const term = (activeStopField === "departure" ? departureStop : arrivalStop)
      .trim()
      .toLowerCase();

    if (!term) {
      return source;
    }

    return source.filter((stop) =>
      String(getStopName(stop)).toLowerCase().includes(term)
    );
  }, [
    activeStopField,
    arrivalOptions,
    arrivalStop,
    departureStop,
    getStopName,
    selectedDeparture,
    stops,
  ]);

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

  const arrivalRequiresDeparture =
    activeStopField === "arrival" && !selectedDeparture;

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
                  Analisi storica dei viaggi
                </Text>
                <Text style={styles.cardBody}>
                  Usa i filtri qui sotto per cercare e analizzare i viaggi
                  passati.
                </Text>
              </View>

              {/* Departure date selector used as an additional search criterion */}
              <View style={[styles.formGroup, styles.dateGroup]}>
                <Text style={styles.formLabel}>Data di partenza</Text>
                <TouchableOpacity
                  style={styles.datePicker}
                  onPress={openDeparturePicker}
                >
                  <Ionicons name="calendar" size={18} color="#20B2AA" />
                  <View style={styles.dateTextWrapper}>
                    <Text style={styles.dateLabel}>Partenza</Text>
                    <Text style={styles.dateText}>{departureLabel}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color="#D4AF37" />
                </TouchableOpacity>
              </View>

              {/* Search input block with magnifier icon and departure/arrival stops */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cerca per fermate</Text>

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
                        placeholder="Partenza"
                        placeholderTextColor="#94a3b8"
                        value={departureStop}
                        onChangeText={handleDepartureTextChange}
                        onFocus={() => setActiveStopField("departure")}
                        // Ritardiamo la chiusura per permettere il tap sui suggerimenti
                        onBlur={() =>
                          setTimeout(() => {
                            setActiveStopField((current) =>
                              current === "departure" ? null : current
                            );
                          }, 150)
                        }
                      />
                    </View>

                    {/* Arrival stop input with leading flag icon */}
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Arrivo"
                        placeholderTextColor="#94a3b8"
                        value={arrivalStop}
                        onChangeText={handleArrivalTextChange}
                        onFocus={() => setActiveStopField("arrival")}
                        onBlur={() =>
                          setTimeout(() => {
                            setActiveStopField((current) =>
                              current === "arrival" ? null : current
                            );
                          }, 150)
                        }
                      />
                    </View>
                  </View>

                  {/* Inline suggestion list behaving like a select dropdown, overlaying background */}
                  {activeStopField && (
                    <View style={styles.suggestionBox}>
                      {arrivalRequiresDeparture ? (
                        <View style={styles.suggestionEmpty}>
                          <Text style={styles.suggestionEmptyText}>
                            Seleziona prima una fermata di partenza.
                          </Text>
                        </View>
                      ) : (activeStopField === "departure" && loadingStops) ||
                        (activeStopField === "arrival" &&
                          loadingArrivalOptions) ? (
                        <View style={styles.suggestionLoader}>
                          <ActivityIndicator color="#20B2AA" size="small" />
                          <Text style={styles.suggestionLoaderText}>
                            Caricamento suggerimenti...
                          </Text>
                        </View>
                      ) : stopSuggestions.length > 0 ? (
                        <ScrollView
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled"
                          contentContainerStyle={styles.suggestionList}
                        >
                          {stopSuggestions.map((item) => {
                            const name = String(getStopName(item));
                            return (
                              <TouchableOpacity
                                key={String(item?.id ?? name)}
                                style={styles.suggestionItem}
                                onPress={() => handleSuggestionPress(item)}
                              >
                                <Text style={styles.suggestionText}>
                                  {name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      ) : (
                        <View style={styles.suggestionEmpty}>
                          <Text style={styles.suggestionEmptyText}>
                            Nessun suggerimento disponibile.
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Shows a small helper text when stop suggestions fail to load */}
                {stopsError && (
                  <Text style={styles.errorText}>{stopsError}</Text>
                )}
                {arrivalOptionsError && (
                  <Text style={styles.errorText}>{arrivalOptionsError}</Text>
                )}
              </View>

              {/* Primary call-to-action button */}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (!selectedDeparture || !selectedArrival || !departureDate) &&
                    styles.primaryButtonDisabled,
                ]}
                onPress={() => {
                  if (selectedDeparture && selectedArrival && departureDate) {
                    // Navigate to journeys screen with search parameters
                    router.push({
                      pathname: "/(tabs)/journeys",
                      params: {
                        departureStopId: selectedDeparture.id.toString(),
                        arrivalStopId: selectedArrival.id.toString(),
                        departureDate: departureDate.toISOString(),
                      },
                    });
                  }
                }}
                disabled={
                  !selectedDeparture || !selectedArrival || !departureDate
                }
              >
                <Text style={styles.primaryButtonText}>Cerca</Text>
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
    // Rosso principale come sfondo
    backgroundColor: "#C41E3A",
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
    backgroundColor: "#C41E3A",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100%",
  },
  card: {
    backgroundColor: "#FFF8DC",
    borderRadius: 28,
    padding: 28,
    gap: 24,
    borderWidth: 3,
    borderColor: "#D4AF37",
    shadowColor: "#000",
    shadowOpacity: 0.5,
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
    backgroundColor: "#20B2AA",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: "#C41E3A",
    fontSize: 28,
    fontWeight: "700",
  },
  cardSubtitle: {
    color: "#2F2F2F",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  cardBody: {
    paddingTop: 10,
    color: "#2F2F2F",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
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
    color: "#2F2F2F",
    fontSize: 14,
    fontWeight: "600",
  },
  inputRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#D4AF37",
    paddingHorizontal: 14,
    height: 56,
    gap: 10,
  },
  textInput: {
    flex: 1,
    color: "#2F2F2F",
    fontSize: 13,
  },
  datePicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D4AF37",
    paddingHorizontal: 14,
    height: 56,
    marginTop: 4,
  },
  dateTextWrapper: {
    flex: 1,
    marginLeft: 12,
  },
  dateLabel: {
    color: "#2F2F2F",
    fontSize: 12,
    marginBottom: 2,
  },
  dateText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#20B2AA",
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: "#D4AF37",
  },
  primaryButtonDisabled: {
    backgroundColor: "#94a3b8",
    opacity: 0.6,
    borderColor: "#94a3b8",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  suggestionBox: {
    position: "absolute",
    top: 64,
    left: 0,
    right: 0,
    backgroundColor: "#FFF8DC",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#D4AF37",
    maxHeight: 200,
    overflow: "hidden",
    zIndex: 20,
    elevation: 20,
  },
  suggestionList: {
    paddingVertical: 4,
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#D4AF37",
  },
  suggestionText: {
    color: "#2F2F2F",
    fontSize: 14,
  },
  suggestionLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  suggestionLoaderText: {
    color: "#2F2F2F",
    fontSize: 13,
  },
  suggestionEmpty: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionEmptyText: {
    color: "#2F2F2F",
    fontSize: 13,
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
    color: "#C41E3A",
    fontSize: 13,
  },
});

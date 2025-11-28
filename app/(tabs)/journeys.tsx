import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useLocalSearchParams } from "expo-router";

import { supabase } from "@/lib/supabase";

type JourneyRow = {
  id: number;
  id_percorso: number | null;
  id_treno: number | null;
  orario_partenza: string;
  orario_arrivo: string;
};

type RouteRow = { id: number; nome?: string | null };
type TrainRow = { id: number; nome?: string | null; tipo?: string | null };
type StopRow = {
  id: number;
  nome?: string | null;
  lat?: number | null;
  lng?: number | null;
};
type PercorsoFermataRow = {
  id_percorso: number;
  id_fermata: number;
  ordine: number;
};

type EnrichedJourney = JourneyRow & {
  route?: RouteRow;
  train?: TrainRow;
  stops: StopRow[];
  metrics: JourneyMetrics;
};

type JourneyMetrics = {
  distanceKm: number;
  durationHours: number;
  averageSpeed: number;
};

const screenWidth = Dimensions.get("window").width;

export default function JourneysScreen() {
  const params = useLocalSearchParams<{
    departureStopId?: string;
    arrivalStopId?: string;
    departureDate?: string;
  }>();

  const [journeys, setJourneys] = useState<EnrichedJourney[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedJourney, setSelectedJourney] =
    useState<EnrichedJourney | null>(null);
  const mapRef = useRef<MapView>(null);

  const fetchJourneys = useCallback(async () => {
    try {
      setErrorMessage(null);
      setLoading(true);

      // Check if we have search parameters
      const hasSearchParams = Boolean(
        params.departureStopId && params.arrivalStopId && params.departureDate
      );

      let query = supabase.from("viaggi").select("*");

      // If we have search parameters, filter the journeys
      // Otherwise, show all journeys
      if (
        hasSearchParams &&
        params.departureStopId &&
        params.arrivalStopId &&
        params.departureDate
      ) {
        const departureStopId = parseInt(params.departureStopId, 10);
        const arrivalStopId = parseInt(params.arrivalStopId, 10);
        const searchDate = new Date(params.departureDate);

        // Set the date to start of day for comparison
        const startOfDay = new Date(searchDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(searchDate);
        endOfDay.setHours(23, 59, 59, 999);

        // First, find all percorso IDs that pass through both stops in the correct order
        // Step 1: Find percorsi that pass through departure stop
        const { data: departureSegments, error: depError } = await supabase
          .from("percorsi_fermate")
          .select("id_percorso, ordine")
          .eq("id_fermata", departureStopId);

        if (depError) throw depError;

        if (!departureSegments || departureSegments.length === 0) {
          setJourneys([]);
          return;
        }

        // Step 2: For each percorso, check if it also passes through arrival stop with higher order
        const validPercorsoIds: number[] = [];

        for (const depSegment of departureSegments) {
          const { data: arrSegments, error: arrError } = await supabase
            .from("percorsi_fermate")
            .select("id_percorso, ordine")
            .eq("id_percorso", depSegment.id_percorso)
            .eq("id_fermata", arrivalStopId)
            .gt("ordine", depSegment.ordine);

          if (arrError) throw arrError;

          if (arrSegments && arrSegments.length > 0) {
            validPercorsoIds.push(depSegment.id_percorso);
          }
        }

        if (validPercorsoIds.length === 0) {
          setJourneys([]);
          return;
        }

        // Step 3: Filter journeys by valid percorso IDs and date
        query = query
          .in("id_percorso", validPercorsoIds)
          .gte("orario_partenza", startOfDay.toISOString())
          .lte("orario_partenza", endOfDay.toISOString());
      }

      const { data: journeyRows, error } = await query
        .order("orario_partenza", { ascending: false })
        .limit(1000);

      if (error) {
        throw error;
      }

      if (!journeyRows || journeyRows.length === 0) {
        setJourneys([]);
        return;
      }

      console.log(
        `[JourneysScreen] Recuperati ${journeyRows.length} viaggi dal database`
      );

      const percorsoIds = Array.from(
        new Set(journeyRows.map((row) => row.id_percorso).filter(Boolean))
      ) as number[];
      const trainIds = Array.from(
        new Set(journeyRows.map((row) => row.id_treno).filter(Boolean))
      ) as number[];

      const [routesRes, trainsRes, percorsoFermateRes] = await Promise.all([
        percorsoIds.length
          ? supabase.from("percorsi").select("*").in("id", percorsoIds)
          : Promise.resolve({ data: [], error: null }),
        trainIds.length
          ? supabase.from("treni").select("*").in("id", trainIds)
          : Promise.resolve({ data: [], error: null }),
        percorsoIds.length
          ? supabase
              .from("percorsi_fermate")
              .select("*")
              .in("id_percorso", percorsoIds)
              .order("ordine", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (routesRes.error) throw routesRes.error;
      if (trainsRes.error) throw trainsRes.error;
      if (percorsoFermateRes.error) throw percorsoFermateRes.error;

      const routesMap = new Map<number, RouteRow>(
        (routesRes.data as RouteRow[]).map((route) => [route.id, route])
      );
      const trainsMap = new Map<number, TrainRow>(
        (trainsRes.data as TrainRow[]).map((train) => [train.id, train])
      );

      const stopIdsNeeded = new Set<number>();
      const percorsoStops = new Map<number, PercorsoFermataRow[]>();

      (percorsoFermateRes.data as PercorsoFermataRow[]).forEach((row) => {
        if (!percorsoStops.has(row.id_percorso)) {
          percorsoStops.set(row.id_percorso, []);
        }
        percorsoStops.get(row.id_percorso)!.push(row);
        stopIdsNeeded.add(row.id_fermata);
      });

      const stopsRes =
        stopIdsNeeded.size > 0
          ? await supabase
              .from("fermate")
              .select("*")
              .in("id", Array.from(stopIdsNeeded))
          : { data: [], error: null };

      if (stopsRes.error) throw stopsRes.error;

      const stopsMap = new Map<number, StopRow>(
        (stopsRes.data as StopRow[]).map((stop) => [stop.id, stop])
      );

      const enriched = (journeyRows as JourneyRow[]).map((journey) => {
        const orderedStops = (
          journey.id_percorso
            ? percorsoStops.get(journey.id_percorso) ?? []
            : []
        )
          .sort((a, b) => a.ordine - b.ordine)
          .map((rel) => stopsMap.get(rel.id_fermata))
          .filter((stop): stop is StopRow => Boolean(stop));

        return {
          ...journey,
          route: journey.id_percorso
            ? routesMap.get(journey.id_percorso)
            : undefined,
          train: journey.id_treno ? trainsMap.get(journey.id_treno) : undefined,
          stops: orderedStops,
          metrics: computeJourneyMetrics(journey, orderedStops),
        };
      });

      console.log(`[JourneysScreen] Viaggi arricchiti: ${enriched.length}`);
      setJourneys(enriched);
    } catch (err: any) {
      setErrorMessage(
        err?.message ?? "Impossibile recuperare i viaggi dal database."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [params.departureStopId, params.arrivalStopId, params.departureDate]);

  useEffect(() => {
    fetchJourneys();
  }, [fetchJourneys]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchJourneys();
  }, [fetchJourneys]);

  const modalMetrics = selectedJourney?.metrics;
  const routeCoordinates = useMemo(() => {
    if (
      !selectedJourney ||
      !selectedJourney.stops ||
      selectedJourney.stops.length === 0
    ) {
      console.log(
        `[JourneysScreen] Nessuna fermata disponibile per il viaggio ${selectedJourney?.id}`
      );
      return [];
    }

    console.log(
      `[JourneysScreen] Viaggio ${selectedJourney.id}: ${selectedJourney.stops.length} fermate totali`
    );

    // Prendi TUTTE le fermate nell'ordine corretto per disegnare la tratta completa
    const coords = selectedJourney.stops
      .filter((stop) => {
        const hasLat = stop && Number.isFinite(Number(stop.lat));
        const hasLng = stop && Number.isFinite(Number(stop.lng));
        if (!hasLat || !hasLng) {
          console.log(
            `[JourneysScreen] Fermata "${stop?.nome}" senza coordinate valide: lat=${stop?.lat}, lng=${stop?.lng}`
          );
        }
        return hasLat && hasLng;
      })
      .map((stop) => ({
        latitude: Number(stop.lat),
        longitude: Number(stop.lng),
      }));

    console.log(
      `[JourneysScreen] Coordinate percorso modale: ${coords.length} fermate con coordinate valide su ${selectedJourney.stops.length} totali`
    );
    if (coords.length > 0) {
      coords.forEach((coord, idx) => {
        console.log(
          `[JourneysScreen] Fermata ${idx + 1}: lat=${coord.latitude}, lng=${
            coord.longitude
          }`
        );
      });
    }

    return coords;
  }, [selectedJourney]);

  // Regione centrata su tutte le fermate con padding
  const mapRegion = useMemo(() => {
    if (!selectedJourney || routeCoordinates.length < 2) {
      return undefined;
    }

    // Calcola min/max considerando TUTTE le coordinate
    const lats = routeCoordinates.map((c) => c.latitude);
    const lngs = routeCoordinates.map((c) => c.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Aggiungi padding del 30% su tutti i lati
    const latPadding = (maxLat - minLat) * 0.3;
    const lngPadding = (maxLng - minLng) * 0.3;

    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;

    // Calcola i delta con padding
    const latDelta = Math.max(maxLat - minLat + latPadding * 2, 0.05);
    const lngDelta = Math.max(maxLng - minLng + lngPadding * 2, 0.05);

    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [selectedJourney, routeCoordinates]);

  // Adatta la mappa quando cambia il viaggio selezionato
  useEffect(() => {
    if (selectedJourney && routeCoordinates.length >= 2 && mapRef.current) {
      // Piccolo delay per assicurarsi che la mappa sia renderizzata
      const timer = setTimeout(() => {
        mapRef.current?.fitToCoordinates(routeCoordinates, {
          edgePadding: {
            top: 50,
            right: 50,
            bottom: 50,
            left: 50,
          },
          animated: true,
        });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [selectedJourney, routeCoordinates]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={journeys}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>
              {params.departureStopId &&
              params.arrivalStopId &&
              params.departureDate
                ? "Risultati ricerca"
                : "Viaggi disponibili"}
            </Text>
            <Text style={styles.subtitle}>
              {journeys.length > 0
                ? `${journeys.length} viaggio${
                    journeys.length !== 1 ? "i" : ""
                  } trovato${
                    journeys.length !== 1 ? "i" : ""
                  }. Tocca un viaggio per analizzare velocità media e traffico.`
                : params.departureStopId &&
                  params.arrivalStopId &&
                  params.departureDate
                ? "Nessun viaggio trovato con i criteri di ricerca selezionati."
                : "Tocca un viaggio per analizzare velocità media e traffico."}
            </Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#20B2AA" />
          ) : (
            <Text style={styles.emptyText}>
              Nessun viaggio presente al momento.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setSelectedJourney(item)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {item.route?.nome ?? "Percorso sconosciuto"}
              </Text>
              <Text style={styles.cardTrain}>
                {item.train?.nome ?? "Treno non definito"}
              </Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.row}>
                <Text style={styles.label}>Partenza</Text>
                <Text style={styles.value}>
                  {formatDateTime(item.orario_partenza)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Arrivo</Text>
                <Text style={styles.value}>
                  {formatDateTime(item.orario_arrivo)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Velocità media stimata</Text>
                <Text style={styles.highlightValue}>
                  {item.metrics.averageSpeed > 0
                    ? `${item.metrics.averageSpeed.toFixed(1)} km/h`
                    : "N/D"}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal
        animationType="slide"
        transparent
        visible={!!selectedJourney}
        onRequestClose={() => setSelectedJourney(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalContent}>
                {selectedJourney ? (
                  <>
                    <Text style={styles.modalTitle}>
                      {selectedJourney.route?.nome ?? "Viaggio"}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {selectedJourney.train?.nome ?? "Treno non specificato"}
                    </Text>

                    <View style={styles.metricsRow}>
                      <View style={styles.metricBlock}>
                        <Text style={styles.metricLabel}>Velocità media</Text>
                        <Text style={styles.metricValue}>
                          {modalMetrics?.averageSpeed
                            ? `${modalMetrics.averageSpeed.toFixed(1)} km/h`
                            : "N/D"}
                        </Text>
                      </View>
                      <View style={styles.metricBlock}>
                        <Text style={styles.metricLabel}>Distanza stimata</Text>
                        <Text style={styles.metricValue}>
                          {modalMetrics?.distanceKm
                            ? `${modalMetrics.distanceKm.toFixed(1)} km`
                            : "N/D"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.chartWrapper}>
                      <Text style={styles.sectionTitle}>Trend velocità</Text>
                      <View style={styles.chartContainer}>
                        <LineChart
                          data={{
                            labels: ["Inizio", "Metà", "Fine"],
                            datasets: [
                              {
                                data: buildSpeedSeries(
                                  modalMetrics?.averageSpeed ?? 0
                                ),
                              },
                            ],
                          }}
                          width={Math.max(screenWidth - 88, 280)}
                          height={220}
                          chartConfig={chartConfig}
                          bezier
                          style={styles.chart}
                        />
                      </View>
                    </View>

                    <View style={styles.mapWrapper}>
                      <Text style={styles.sectionTitle}>
                        Percorso sulla mappa
                      </Text>
                      {routeCoordinates.length === 0 ? (
                        <Text style={styles.emptyText}>
                          Nessuna fermata con coordinate valide per questo
                          viaggio.
                        </Text>
                      ) : routeCoordinates.length === 1 ? (
                        <Text style={styles.emptyText}>
                          Solo una fermata con coordinate valide. Servono almeno
                          2 fermate per visualizzare il percorso.
                        </Text>
                      ) : routeCoordinates.length >= 2 && mapRegion ? (
                        <MapView
                          ref={mapRef}
                          provider={PROVIDER_GOOGLE}
                          style={styles.map}
                          initialRegion={mapRegion}
                          mapType="standard"
                          onMapReady={() => {
                            console.log("[JourneysScreen] Mappa pronta");
                            console.log(
                              "[JourneysScreen] Fermate totali nel viaggio:",
                              selectedJourney.stops.length
                            );
                            console.log(
                              "[JourneysScreen] Coordinate valide per la mappa:",
                              routeCoordinates.length
                            );
                            console.log(
                              "[JourneysScreen] Coordinate:",
                              JSON.stringify(routeCoordinates)
                            );
                            console.log(
                              "[JourneysScreen] Regione mappa:",
                              JSON.stringify(mapRegion)
                            );

                            // Log delle fermate senza coordinate
                            const stopsWithoutCoords =
                              selectedJourney.stops.filter(
                                (stop) =>
                                  !stop ||
                                  !Number.isFinite(Number(stop.lat)) ||
                                  !Number.isFinite(Number(stop.lng))
                              );
                            if (stopsWithoutCoords.length > 0) {
                              console.log(
                                `[JourneysScreen] ${stopsWithoutCoords.length} fermate senza coordinate valide:`,
                                stopsWithoutCoords
                                  .map((s) => s?.nome)
                                  .join(", ")
                              );
                            }

                            // Adatta la mappa per mostrare tutti i punti con padding
                            if (
                              mapRef.current &&
                              routeCoordinates.length >= 2
                            ) {
                              mapRef.current.fitToCoordinates(
                                routeCoordinates,
                                {
                                  edgePadding: {
                                    top: 50,
                                    right: 50,
                                    bottom: 50,
                                    left: 50,
                                  },
                                  animated: true,
                                }
                              );
                            }
                          }}
                        >
                          {/* Marker partenza */}
                          <Marker
                            key={`marker-start-${selectedJourney.id}`}
                            coordinate={{
                              latitude: routeCoordinates[0].latitude,
                              longitude: routeCoordinates[0].longitude,
                            }}
                            title="Partenza"
                            description={
                              selectedJourney.stops[0]?.nome ??
                              "Punto di partenza"
                            }
                            pinColor="#20B2AA"
                            identifier="start"
                            anchor={{ x: 0.5, y: 1 }}
                          />
                          {/* Marker fermate intermedie */}
                          {routeCoordinates.length > 2 &&
                            routeCoordinates
                              .slice(1, -1)
                              .map((coord, index) => {
                                // Trova la fermata corrispondente in selectedJourney.stops che ha queste coordinate
                                const correspondingStop =
                                  selectedJourney.stops.find(
                                    (stop) =>
                                      stop &&
                                      Number.isFinite(Number(stop.lat)) &&
                                      Number.isFinite(Number(stop.lng)) &&
                                      Math.abs(
                                        Number(stop.lat) - coord.latitude
                                      ) < 0.0001 &&
                                      Math.abs(
                                        Number(stop.lng) - coord.longitude
                                      ) < 0.0001
                                  );
                                const stopIndex = index + 1;
                                return (
                                  <Marker
                                    key={`marker-intermediate-${selectedJourney.id}-${stopIndex}`}
                                    coordinate={{
                                      latitude: coord.latitude,
                                      longitude: coord.longitude,
                                    }}
                                    title={
                                      correspondingStop?.nome ??
                                      `Fermata ${stopIndex + 1}`
                                    }
                                    description="Fermata intermedia"
                                    pinColor="#D4AF37"
                                    identifier={`intermediate-${stopIndex}`}
                                    anchor={{ x: 0.5, y: 1 }}
                                  />
                                );
                              })}
                          {/* Marker arrivo */}
                          {routeCoordinates.length > 1 && (
                            <Marker
                              key={`marker-end-${selectedJourney.id}`}
                              coordinate={{
                                latitude:
                                  routeCoordinates[routeCoordinates.length - 1]
                                    .latitude,
                                longitude:
                                  routeCoordinates[routeCoordinates.length - 1]
                                    .longitude,
                              }}
                              title="Arrivo"
                              description={
                                selectedJourney.stops[
                                  selectedJourney.stops.length - 1
                                ]?.nome ?? "Punto di arrivo"
                              }
                              pinColor="#C41E3A"
                              identifier="end"
                              anchor={{ x: 0.5, y: 1 }}
                            />
                          )}
                          {/* Ombra del percorso per maggiore visibilità */}
                          <Polyline
                            key={`polyline-shadow-${selectedJourney.id}`}
                            coordinates={routeCoordinates.map((c) => ({
                              latitude: c.latitude,
                              longitude: c.longitude,
                            }))}
                            strokeColor="rgba(0, 0, 0, 0.7)"
                            strokeWidth={14}
                            lineDashPattern={[]}
                            lineCap="round"
                            lineJoin="round"
                            tappable={false}
                          />
                          {/* Percorso principale evidenziato - linea arancione brillante */}
                          <Polyline
                            key={`polyline-main-${selectedJourney.id}`}
                            coordinates={routeCoordinates.map((c) => ({
                              latitude: c.latitude,
                              longitude: c.longitude,
                            }))}
                            strokeColor="#D4AF37"
                            strokeWidth={10}
                            lineDashPattern={[]}
                            lineCap="round"
                            lineJoin="round"
                            tappable={false}
                          />
                        </MapView>
                      ) : (
                        <Text style={styles.emptyText}>
                          Coordinate insufficienti per la mappa.
                        </Text>
                      )}
                    </View>
                  </>
                ) : null}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedJourney(null)}
            >
              <Text style={styles.closeButtonText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {errorMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{errorMessage}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const chartConfig = {
  backgroundColor: "#FFF8DC",
  backgroundGradientFrom: "#FFF8DC",
  backgroundGradientTo: "#FFFFFF",
  decimalPlaces: 1,
  color: (opacity = 1) => `rgba(32, 178, 170, ${opacity})`, // Teal
  labelColor: (opacity = 1) => `rgba(47, 47, 47, ${opacity})`, // Grigio scuro
  propsForDots: {
    r: "4",
    strokeWidth: "2",
    stroke: "#C41E3A", // Rosso
  },
};

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function computeJourneyMetrics(
  journey: JourneyRow,
  stops: StopRow[]
): JourneyMetrics {
  // Calcola la distanza totale sommando le distanze tra tutte le fermate consecutive
  let distanceKm = 0;
  if (stops.length >= 2) {
    for (let i = 0; i < stops.length - 1; i++) {
      const currentStop = stops[i];
      const nextStop = stops[i + 1];
      if (currentStop && nextStop) {
        const segmentDistance = haversineKm(currentStop, nextStop);
        distanceKm += segmentDistance;
      }
    }
  }

  const start = new Date(journey.orario_partenza);
  const end = new Date(journey.orario_arrivo);
  const durationHours = Math.max(
    0,
    (end.getTime() - start.getTime()) / (1000 * 60 * 60)
  );
  const averageSpeed =
    durationHours > 0 && distanceKm > 0 ? distanceKm / durationHours : 0;

  return { distanceKm, durationHours, averageSpeed };
}

function haversineKm(
  departure: StopRow,
  arrival: StopRow,
  earthRadiusKm = 6371
) {
  const lat1 = toRadians(Number(departure.lat));
  const lon1 = toRadians(Number(departure.lng));
  const lat2 = toRadians(Number(arrival.lat));
  const lon2 = toRadians(Number(arrival.lng));

  if (
    Number.isNaN(lat1) ||
    Number.isNaN(lon1) ||
    Number.isNaN(lat2) ||
    Number.isNaN(lon2)
  ) {
    return 0;
  }

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function buildSpeedSeries(avg: number) {
  if (avg <= 0) {
    return [0, 0, 0];
  }
  const lower = avg * 0.85;
  const mid = avg;
  const upper = avg * 1.05;
  return [lower, mid, upper];
}

function getRegionFromStops(stops: StopRow[]) {
  if (!stops || stops.length === 0) return undefined;
  const first = stops[0];
  const last = stops[stops.length - 1] ?? first;

  const lat1 = Number(first?.lat);
  const lon1 = Number(first?.lng);
  const lat2 = Number(last?.lat ?? first?.lat);
  const lon2 = Number(last?.lng ?? first?.lng);

  if ([lat1, lon1, lat2, lon2].some((value) => Number.isNaN(value))) {
    return undefined;
  }

  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;
  const latDelta = Math.max(Math.abs(lat1 - lat2) * 2, 0.2);
  const lonDelta = Math.max(Math.abs(lon1 - lon2) * 2, 0.2);

  return {
    latitude: midLat,
    longitude: midLon,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#C41E3A",
    paddingTop: 25,
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    color: "#FFF8DC",
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: "#FFF8DC",
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFF8DC",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: "#D4AF37",
  },
  cardHeader: {
    gap: 4,
  },
  cardTitle: {
    color: "#C41E3A",
    fontSize: 18,
    fontWeight: "700",
  },
  cardTrain: {
    color: "#20B2AA",
    fontSize: 14,
    fontWeight: "600",
  },
  cardBody: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    color: "#2F2F2F",
    fontSize: 13,
  },
  value: {
    color: "#2F2F2F",
    fontSize: 14,
    fontWeight: "600",
  },
  highlightValue: {
    color: "#D4AF37",
    fontSize: 15,
    fontWeight: "700",
  },
  emptyText: {
    textAlign: "center",
    color: "#FFF8DC",
    marginTop: 24,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(196, 30, 58, 0.8)",
    justifyContent: "center",
    padding: 16,
  },
  modalContainer: {
    backgroundColor: "#FFF8DC",
    borderRadius: 24,
    borderWidth: 3,
    borderColor: "#D4AF37",
    maxHeight: "90%",
    overflow: "hidden",
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 12,
  },
  modalContent: {
    gap: 16,
  },
  modalTitle: {
    color: "#C41E3A",
    fontSize: 20,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: "#20B2AA",
    fontSize: 14,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 16,
  },
  metricBlock: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 2,
    borderColor: "#D4AF37",
  },
  metricLabel: {
    color: "#2F2F2F",
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    color: "#C41E3A",
    fontSize: 18,
    fontWeight: "700",
  },
  chartWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    borderWidth: 2,
    borderColor: "#D4AF37",
    overflow: "hidden",
  },
  chartContainer: {
    alignItems: "center",
    overflow: "hidden",
  },
  chart: {
    marginVertical: 8,
    borderRadius: 12,
  },
  sectionTitle: {
    color: "#2F2F2F",
    fontSize: 14,
    fontWeight: "600",
  },
  mapWrapper: {
    height: 220,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderWidth: 2,
    borderColor: "#D4AF37",
    gap: 8,
  },
  map: {
    flex: 1,
    borderRadius: 12,
  },
  closeButton: {
    backgroundColor: "#20B2AA",
    borderRadius: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 0,
    borderTopWidth: 2,
    borderTopColor: "#D4AF37",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  toast: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "#C41E3A",
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: "#D4AF37",
  },
  toastText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "600",
  },
});

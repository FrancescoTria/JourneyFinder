// Simple database explorer screen that can show any table as a scrollable grid.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

// List of tables that the user can explore.
// Aggiungi qui i nomi di tutte le tabelle che vuoi mostrare.
const TABLES = ["fermate", "percorsi", "percorsi_fermate", "viaggi", "treni"];

export default function TabTwoScreen() {
  // Current table selected from the list above.
  const [selectedTable, setSelectedTable] = useState<string>(TABLES[0]);
  // Rows returned from Supabase for the selected table.
  const [rows, setRows] = useState<any[]>([]);
  // Loading and error state for the table fetch.
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Computes the list of column names based on the first row of data.
  const columns = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  // Loads all rows from the currently selected table.
  const fetchTable = useCallback(async (tableName: string) => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase.from(tableName).select("*");

      if (error) {
        throw error;
      }

      setRows(data ?? []);
    } catch (error: any) {
      setErrorMessage(
        error.message ?? "Impossibile caricare i dati dal database."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Reloads data when the selected table changes or on first mount.
  useEffect(() => {
    fetchTable(selectedTable);
  }, [fetchTable, selectedTable]);

  // Every 5 seconds refresh the currently selected table to keep data in sync.
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchTable(selectedTable);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [fetchTable, selectedTable]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header with title and simple table selector */}
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Database Explorer</Text>
          <View style={styles.tableSelector}>
            {TABLES.map((table) => (
              <TouchableOpacity
                key={table}
                style={[
                  styles.tableChip,
                  table === selectedTable && styles.tableChipActive,
                ]}
                onPress={() => setSelectedTable(table)}
              >
                <Text
                  style={[
                    styles.tableChipText,
                    table === selectedTable && styles.tableChipTextActive,
                  ]}
                >
                  {table}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Main content: table grid with horizontal scroll if needed */}
        <View style={styles.content}>
          {loading && rows.length === 0 ? (
            // Initial loading spinner when we first fetch data.
            <ActivityIndicator size="large" color="#1d4ed8" />
          ) : errorMessage ? (
            // Error message when something goes wrong with the query.
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : rows.length === 0 ? (
            // Empty state when the table exists but has no rows.
            <Text style={styles.emptyText}>Nessun dato trovato.</Text>
          ) : (
            <ScrollView horizontal>
              <View>
                {/* Column headers generated from object keys */}
                <View style={styles.headerRow}>
                  {columns.map((column) => (
                    <View key={column} style={styles.cellHeader}>
                      <Text style={styles.headerText}>{column}</Text>
                    </View>
                  ))}
                </View>

                {/* Data rows for the currently selected table */}
                {rows.map((row, rowIndex) => (
                  <View
                    key={row.id ?? rowIndex}
                    style={[
                      styles.dataRow,
                      rowIndex % 2 === 0 && styles.dataRowAlt,
                    ]}
                  >
                    {columns.map((column) => (
                      <View key={column} style={styles.cell}>
                        <Text style={styles.cellText}>
                          {String(
                            row[column] === null || row[column] === undefined
                              ? ""
                              : row[column]
                          )}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Styles for the database explorer screen and the table layout.
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
    paddingTop: 25,
    paddingHorizontal: 10,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f9fafb",
    marginBottom: 12,
  },
  tableSelector: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tableChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#4b5563",
    backgroundColor: "#020617",
  },
  tableChipActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },
  tableChipText: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "500",
  },
  tableChipTextActive: {
    color: "#f9fafb",
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#020617",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  headerText: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    textAlign: "center",
  },
  cellHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: "#1f2937",
    minWidth: 140,
    maxWidth: 260,
  },
  dataRow: {
    flexDirection: "row",
    backgroundColor: "#020617",
  },
  dataRowAlt: {
    backgroundColor: "#030712",
  },
  cell: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: "#1f2937",
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    minWidth: 140,
    maxWidth: 260,
  },
  cellText: {
    color: "#d1d5db",
    fontSize: 12,
    textAlign: "center",
  },
  emptyText: {
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 20,
  },
  errorText: {
    color: "#f87171",
    textAlign: "center",
    marginTop: 20,
  },
});

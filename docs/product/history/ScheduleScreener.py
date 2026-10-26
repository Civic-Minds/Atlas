import pandas as pd
import os
import numpy as np

# Ask user to choose a city
gtfs_city = input("Enter the city (Los Angeles / Spokane): ").strip()

# Paths to GTFS files
gtfs_folder = os.path.expanduser(f"~/Desktop/Coding/ScheduleScreener/GTFS/{gtfs_city}")
routes_path = os.path.join(gtfs_folder, "routes.txt")
stop_times_path = os.path.join(gtfs_folder, "stop_times.txt")
trips_path = os.path.join(gtfs_folder, "trips.txt")
calendar_path = os.path.join(gtfs_folder, "calendar.txt")

# Load GTFS data
routes = pd.read_csv(routes_path)
stop_times = pd.read_csv(stop_times_path, low_memory=False)
trips = pd.read_csv(trips_path)
calendar = pd.read_csv(calendar_path)

# Identify services that operate on ANY weekday
target_days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
valid_services = calendar[calendar[target_days].any(axis=1)]['service_id'].tolist()

# Filter trips to these services
trips = trips[trips['service_id'].isin(valid_services)]

# Merge trips with routes
trips_with_routes = trips.merge(routes[['route_id', 'route_short_name']], on="route_id", how="left")
trips_with_routes = trips_with_routes.dropna(subset=["route_short_name"])

# Get first departure time per trip
first_departures = stop_times.sort_values(['trip_id', 'stop_sequence']).groupby('trip_id').first()['departure_time'].reset_index()
first_departures.rename(columns={'departure_time': 'trip_start_time'}, inplace=True)

# Merge with trips data
trips_with_routes = trips_with_routes.merge(first_departures, on='trip_id', how='left')
trips_with_routes = trips_with_routes.dropna(subset=['trip_start_time'])

# Convert time to minutes since midnight
def time_to_minutes(t):
    try:
        h, m, s = map(int, t.split(':'))
        return h * 60 + m + (s / 60)
    except:
        return None

trips_with_routes['start_minutes'] = trips_with_routes['trip_start_time'].apply(time_to_minutes)
trips_with_routes = trips_with_routes.dropna(subset=['start_minutes'])

# Filter for 7AM (420 min) to 10PM (1320 min)
trips_with_routes = trips_with_routes[(trips_with_routes['start_minutes'] >= 420) & 
                                     (trips_with_routes['start_minutes'] < 1320)]

# Merge with calendar to get operating days
trips_with_calendar = trips_with_routes.merge(
    calendar[['service_id'] + target_days],
    on='service_id',
    how='left'
)

# ==== FIXED SECTION =====
daily_departures = trips_with_calendar.groupby(
    ['route_short_name', 'direction_id']
).apply(
    lambda x: (x[target_days].sum(axis=1).sum() / 5)  # Fixed line
).reset_index(name='Daily Departures')

total_departures = daily_departures.groupby('route_short_name')['Daily Departures'].sum().reset_index()
# ========================

total_departures.columns = ['Route', 'Total Daily Departures']

# Calculate headways per direction
trips_sorted = trips_with_routes.sort_values(['route_short_name', 'direction_id', 'start_minutes'])
trips_sorted['headway'] = trips_sorted.groupby(['route_short_name', 'direction_id'])['start_minutes'].diff()

# Get maximum headway per direction
max_headways = trips_sorted.groupby(['route_short_name', 'direction_id'])['headway'].max().reset_index()
max_headways.columns = ['Route', 'Direction', 'Max Headway']

# Merge with departure counts
route_analysis = total_departures.merge(max_headways, on='Route', how='left')

# Categorize frequencies
def categorize_frequency(freq):
    if freq <= 10:
        return "≤10 min"
    elif freq <= 15:
        return "≤15 min"
    elif freq <= 20:
        return "≤20 min"
    elif freq <= 30:
        return "≤30 min"
    else:
        return "≤60 min"

route_analysis['Frequency Bucket'] = route_analysis['Max Headway'].apply(categorize_frequency)

# Print results
print("\n🚌 Directional Route Analysis 🚌\n")
print("Columns:")
print("- Total Daily Departures: Sum of both directions")
print("- Direction: 0 or 1 (typically inbound/outbound)")
print("- Max Headway: Longest gap in minutes for that direction\n")

for route in route_analysis['Route'].unique():
    route_data = route_analysis[route_analysis['Route'] == route]
    print(f"\nRoute {route}: {route_data['Total Daily Departures'].values[0]} total departures")
    print(route_data[['Direction', 'Max Headway', 'Frequency Bucket']].to_string(index=False))

# Export to CSV
save_csv = input("\nWould you like to save the results as a CSV file? (yes/no): ").strip().lower()
if save_csv == 'yes':
    output_path = os.path.join(gtfs_folder, "directional_analysis.csv")
    route_analysis.to_csv(output_path, index=False)
    print(f"Results saved to {output_path}")
using UnityEngine;
using System.Collections.Generic;

namespace Thru
{
    /// <summary>
    /// Collection of trails and locations forming a map.
    /// Replaces MonoGame's TrailMap.
    /// </summary>
    public class TrailMap : MonoBehaviour
    {
        [Header("Map Data")]
        public string mapName;

        [Header("Collections")]
        public List<Location> locations = new List<Location>();
        public List<Trail> trails = new List<Trail>();

        [Header("Prefabs")]
        public GameObject locationPrefab;
        public GameObject trailPrefab;

        [Header("Containers")]
        public Transform locationsContainer;
        public Transform trailsContainer;

        private Dictionary<string, Location> _locationLookup = new Dictionary<string, Location>();

        private void Awake()
        {
            if (locationsContainer == null)
            {
                locationsContainer = new GameObject("Locations").transform;
                locationsContainer.SetParent(transform);
            }

            if (trailsContainer == null)
            {
                trailsContainer = new GameObject("Trails").transform;
                trailsContainer.SetParent(transform);
            }
        }

        /// <summary>
        /// Add a location to the map
        /// </summary>
        public Location AddLocation(string id, string name, Vector3 coords)
        {
            // Create location object
            GameObject locObj;
            if (locationPrefab != null)
            {
                locObj = Instantiate(locationPrefab, locationsContainer);
            }
            else
            {
                locObj = new GameObject($"Location_{name}");
                locObj.transform.SetParent(locationsContainer);
            }

            // Position based on coordinates
            locObj.transform.position = GeoToWorld(coords);

            // Create location data
            var location = new Location(id, name, coords);
            locations.Add(location);
            _locationLookup[id] = location;

            return location;
        }

        /// <summary>
        /// Add a trail connecting two locations
        /// </summary>
        public Trail AddTrail(string loc1Id, string loc2Id, float value, string name)
        {
            if (!_locationLookup.TryGetValue(loc1Id, out Location loc1) ||
                !_locationLookup.TryGetValue(loc2Id, out Location loc2))
            {
                Debug.LogError($"Could not find locations {loc1Id} or {loc2Id}");
                return null;
            }

            return AddTrail(loc1, loc2, value, name);
        }

        /// <summary>
        /// Add a trail connecting two locations
        /// </summary>
        public Trail AddTrail(Location loc1, Location loc2, float value, string name)
        {
            // Create trail object
            GameObject trailObj;
            if (trailPrefab != null)
            {
                trailObj = Instantiate(trailPrefab, trailsContainer);
            }
            else
            {
                trailObj = new GameObject($"Trail_{name}");
                trailObj.transform.SetParent(trailsContainer);
            }

            // Add trail component
            var trail = trailObj.AddComponent<Trail>();
            trail.Initialize(loc1, loc2, value, name);

            trails.Add(trail);

            // Add connections to locations
            loc1.Connections.Add(new LocationConnection { Target = loc2, Weight = value });
            loc2.Connections.Add(new LocationConnection { Target = loc1, Weight = value });

            return trail;
        }

        /// <summary>
        /// Get location by ID
        /// </summary>
        public Location GetLocation(string id)
        {
            _locationLookup.TryGetValue(id, out Location loc);
            return loc;
        }

        /// <summary>
        /// Find nearest location to a point
        /// </summary>
        public Location GetNearestLocation(Vector3 worldPos)
        {
            Location nearest = null;
            float minDist = float.MaxValue;

            foreach (var loc in locations)
            {
                float dist = Vector3.Distance(GeoToWorld(loc.Coords), worldPos);
                if (dist < minDist)
                {
                    minDist = dist;
                    nearest = loc;
                }
            }

            return nearest;
        }

        /// <summary>
        /// Convert geographic coordinates to world position
        /// </summary>
        public Vector3 GeoToWorld(Vector3 geoCoords)
        {
            // Simple conversion - longitude to X, latitude to Y
            // Adjust scale as needed for your map
            return new Vector3(geoCoords.x, geoCoords.y, 0);
        }

        /// <summary>
        /// Load map from JSON data
        /// </summary>
        public void LoadFromData(TrailMapData data)
        {
            mapName = data.name;

            // Load locations first
            foreach (var locData in data.locations)
            {
                AddLocation(locData.id, locData.name, locData.coords);
            }

            // Load trails
            foreach (var trailData in data.trails)
            {
                AddTrail(trailData.location1Id, trailData.location2Id, trailData.value, trailData.name);
            }
        }

        /// <summary>
        /// Clear all locations and trails
        /// </summary>
        public void Clear()
        {
            foreach (var trail in trails)
            {
                if (trail != null)
                    Destroy(trail.gameObject);
            }
            trails.Clear();

            locations.Clear();
            _locationLookup.Clear();

            // Clear containers
            foreach (Transform child in locationsContainer)
                Destroy(child.gameObject);
            foreach (Transform child in trailsContainer)
                Destroy(child.gameObject);
        }
    }

    /// <summary>
    /// Data structure for loading trail maps from JSON
    /// </summary>
    [System.Serializable]
    public class TrailMapData
    {
        public string name;
        public LocationData[] locations;
        public TrailData[] trails;
    }

    [System.Serializable]
    public class LocationData
    {
        public string id;
        public string name;
        public Vector3 coords;
    }

    [System.Serializable]
    public class TrailData
    {
        public string name;
        public string location1Id;
        public string location2Id;
        public float value;
    }
}

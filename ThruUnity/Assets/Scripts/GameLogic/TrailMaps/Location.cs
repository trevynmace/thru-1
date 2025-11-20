using UnityEngine;
using System.Collections.Generic;

namespace Thru
{
    /// <summary>
    /// Represents a location on the trail map.
    /// Placeholder for porting from MonoGame version.
    /// </summary>
    [System.Serializable]
    public class Location
    {
        public string ID;
        public string Name;
        public Vector3 Coords; // GeoJSON coordinates (lon, lat, elevation)

        [Header("Connections")]
        public List<LocationConnection> Connections = new List<LocationConnection>();

        public Location()
        {
        }

        public Location(string id, string name, Vector3 coords)
        {
            ID = id;
            Name = name;
            Coords = coords;
        }

        /// <summary>
        /// Get adjacent locations with travel weights
        /// </summary>
        public Dictionary<Location, float> GetAdjacentLocationsWithWeight()
        {
            var result = new Dictionary<Location, float>();
            foreach (var connection in Connections)
            {
                if (connection.Target != null)
                {
                    result[connection.Target] = connection.Weight;
                }
            }
            return result;
        }
    }

    /// <summary>
    /// Connection between two locations
    /// </summary>
    [System.Serializable]
    public class LocationConnection
    {
        public Location Target;
        public float Weight; // Distance or difficulty
    }
}

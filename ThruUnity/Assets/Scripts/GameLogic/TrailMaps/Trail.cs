using UnityEngine;
using System.Collections.Generic;

namespace Thru
{
    /// <summary>
    /// Trail connecting two locations.
    /// Replaces MonoGame's Trail with Unity LineRenderer.
    /// </summary>
    public class Trail : MonoBehaviour
    {
        [Header("Trail Data")]
        public string trailId;
        public string trailName;
        public string description;
        public float value; // Distance or difficulty

        [Header("Connections")]
        public Location location1;
        public Location location2;

        [Header("Visual")]
        public Color trailColor = Color.red;
        public float lineWidth = 0.1f;
        public bool isCurrent;

        [Header("Characters on Trail")]
        public List<Character> characters = new List<Character>();

        // Components
        private LineRenderer _lineRenderer;
        private SpriteAnimator _animator;

        private void Awake()
        {
            SetupLineRenderer();
        }

        private void SetupLineRenderer()
        {
            _lineRenderer = GetComponent<LineRenderer>();
            if (_lineRenderer == null)
            {
                _lineRenderer = gameObject.AddComponent<LineRenderer>();
            }

            // Configure line renderer
            _lineRenderer.startWidth = lineWidth;
            _lineRenderer.endWidth = lineWidth;
            _lineRenderer.startColor = trailColor;
            _lineRenderer.endColor = trailColor;
            _lineRenderer.positionCount = 2;
            _lineRenderer.useWorldSpace = true;

            // Use a simple material
            _lineRenderer.material = new Material(Shader.Find("Sprites/Default"));
        }

        /// <summary>
        /// Initialize the trail
        /// </summary>
        public void Initialize(Location loc1, Location loc2, float val, string name)
        {
            location1 = loc1;
            location2 = loc2;
            value = val;
            trailName = name;

            UpdateLinePositions();
        }

        /// <summary>
        /// Update line renderer positions
        /// </summary>
        public void UpdateLinePositions()
        {
            if (_lineRenderer == null || location1 == null || location2 == null)
                return;

            // Convert geo coordinates to world positions
            Vector3 start = GeoToWorld(location1.Coords);
            Vector3 end = GeoToWorld(location2.Coords);

            _lineRenderer.SetPosition(0, start);
            _lineRenderer.SetPosition(1, end);
        }

        /// <summary>
        /// Convert geographic coordinates to world position
        /// </summary>
        private Vector3 GeoToWorld(Vector3 geoCoords)
        {
            // Simple conversion - adjust based on your map scale
            // geoCoords: x = longitude, y = latitude, z = elevation
            return new Vector3(geoCoords.x, geoCoords.y, 0);
        }

        /// <summary>
        /// Set trail color
        /// </summary>
        public void SetColor(Color color)
        {
            trailColor = color;
            if (_lineRenderer != null)
            {
                _lineRenderer.startColor = color;
                _lineRenderer.endColor = color;
            }
        }

        /// <summary>
        /// Set trail width
        /// </summary>
        public void SetWidth(float width)
        {
            lineWidth = width;
            if (_lineRenderer != null)
            {
                _lineRenderer.startWidth = width;
                _lineRenderer.endWidth = width;
            }
        }

        /// <summary>
        /// Get length of trail
        /// </summary>
        public float GetLength()
        {
            if (location1 == null || location2 == null) return 0;
            return Vector3.Distance(location1.Coords, location2.Coords);
        }
    }
}

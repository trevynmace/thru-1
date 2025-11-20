using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Map view for trail navigation.
    /// Replaces MonoGame's MapGameView.
    /// </summary>
    public class MapGameView : MonoBehaviour, IGameView
    {
        [Header("References")]
        public TrailMap trailMap;
        public CameraController mapCamera;

        [Header("Player Marker")]
        public GameObject playerMarker;

        private GameStateManager _stateManager;
        private CanvasGroup _canvasGroup;

        private void Awake()
        {
            _canvasGroup = GetComponent<CanvasGroup>();
        }

        public void Initialize(GameStateManager stateManager)
        {
            _stateManager = stateManager;

            if (trailMap == null)
                trailMap = FindFirstObjectByType<TrailMap>();

            if (mapCamera == null)
                mapCamera = FindFirstObjectByType<CameraController>();
        }

        public void Show()
        {
            gameObject.SetActive(true);
            if (_canvasGroup != null)
            {
                _canvasGroup.alpha = 1f;
                _canvasGroup.interactable = true;
            }

            // Center on player location
            if (_stateManager.Player != null && _stateManager.Player.Location != null)
            {
                CenterOnLocation(_stateManager.Player.Location);
            }

            UpdatePlayerMarker();
        }

        public void Hide()
        {
            if (_canvasGroup != null)
            {
                _canvasGroup.alpha = 0f;
                _canvasGroup.interactable = false;
            }
            gameObject.SetActive(false);
        }

        public PlayState UpdateView()
        {
            // Handle map controls
            HandleMapInput();

            // Close map with M or Escape
            if (Input.GetKeyDown(KeyCode.M) || Input.GetKeyDown(KeyCode.Escape))
            {
                return PlayState.Play;
            }

            return PlayState.Map;
        }

        private void HandleMapInput()
        {
            // Camera controls are handled by CameraController
            // Additional map-specific input here

            // Click to select location
            if (Input.GetMouseButtonDown(0))
            {
                HandleLocationClick();
            }
        }

        private void HandleLocationClick()
        {
            if (mapCamera == null) return;

            Vector2 worldPos = mapCamera.ScreenToWorld(Input.mousePosition);
            Location nearest = trailMap?.GetNearestLocation(worldPos);

            if (nearest != null)
            {
                Debug.Log($"Clicked near location: {nearest.Name}");
                // Could show location info, set as destination, etc.
            }
        }

        private void CenterOnLocation(Location location)
        {
            if (mapCamera != null && location != null)
            {
                Vector3 worldPos = trailMap != null ?
                    trailMap.GeoToWorld(location.Coords) :
                    location.Coords;

                mapCamera.FocusOn(worldPos);
            }
        }

        private void UpdatePlayerMarker()
        {
            if (playerMarker == null || _stateManager.Player?.Location == null) return;

            Vector3 markerPos = trailMap != null ?
                trailMap.GeoToWorld(_stateManager.Player.Location.Coords) :
                _stateManager.Player.Location.Coords;

            playerMarker.transform.position = markerPos;
        }
    }
}

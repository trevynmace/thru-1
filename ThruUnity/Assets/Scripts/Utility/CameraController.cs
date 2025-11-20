using UnityEngine;

namespace Thru
{
    /// <summary>
    /// 2D camera controller with pan and zoom.
    /// Replaces MonoGame's Camera2d.
    /// </summary>
    public class CameraController : MonoBehaviour
    {
        [Header("Zoom Settings")]
        public float zoom = 1f;
        public float minZoom = 0.1f;
        public float maxZoom = 10f;
        public float zoomSpeed = 0.5f;

        [Header("Pan Settings")]
        public float panSpeed = 10f;
        public bool invertPan = false;

        [Header("Input")]
        public bool enableMousePan = true;
        public bool enableKeyboardPan = true;
        public bool enableScrollZoom = true;

        // Position (world coordinates)
        public Vector2 Position
        {
            get => transform.position;
            set => transform.position = new Vector3(value.x, value.y, transform.position.z);
        }

        public float Rotation
        {
            get => transform.eulerAngles.z;
            set => transform.eulerAngles = new Vector3(0, 0, value);
        }

        public float Zoom
        {
            get => zoom;
            set
            {
                zoom = Mathf.Clamp(value, minZoom, maxZoom);
                ApplyZoom();
            }
        }

        private Camera _camera;
        private Vector3 _lastMousePosition;
        private bool _isPanning;

        private void Awake()
        {
            _camera = GetComponent<Camera>();
            if (_camera == null)
                _camera = Camera.main;
        }

        private void Start()
        {
            ApplyZoom();
        }

        private void Update()
        {
            HandleInput();
        }

        private void HandleInput()
        {
            // Mouse pan (middle mouse button or right mouse button)
            if (enableMousePan)
            {
                if (Input.GetMouseButtonDown(2) || Input.GetMouseButtonDown(1))
                {
                    _isPanning = true;
                    _lastMousePosition = Input.mousePosition;
                }

                if (Input.GetMouseButtonUp(2) || Input.GetMouseButtonUp(1))
                {
                    _isPanning = false;
                }

                if (_isPanning)
                {
                    Vector3 delta = Input.mousePosition - _lastMousePosition;
                    delta = delta * (invertPan ? 1 : -1) * panSpeed * Time.deltaTime / zoom;
                    Move(new Vector2(delta.x, delta.y));
                    _lastMousePosition = Input.mousePosition;
                }
            }

            // Keyboard pan (WASD or arrow keys)
            if (enableKeyboardPan)
            {
                Vector2 move = Vector2.zero;

                if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow))
                    move.y += 1;
                if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow))
                    move.y -= 1;
                if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow))
                    move.x -= 1;
                if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow))
                    move.x += 1;

                if (move != Vector2.zero)
                {
                    Move(move.normalized * panSpeed * Time.deltaTime);
                }
            }

            // Scroll zoom
            if (enableScrollZoom)
            {
                float scroll = Input.mouseScrollDelta.y;
                if (scroll != 0)
                {
                    Zoom *= 1 + scroll * zoomSpeed;
                }
            }
        }

        /// <summary>
        /// Move camera by amount (in world units)
        /// </summary>
        public void Move(Vector2 amount)
        {
            transform.position += new Vector3(amount.x, amount.y, 0);
        }

        /// <summary>
        /// Set camera position
        /// </summary>
        public void SetPosition(Vector2 position)
        {
            transform.position = new Vector3(position.x, position.y, transform.position.z);
        }

        /// <summary>
        /// Apply zoom to camera
        /// </summary>
        private void ApplyZoom()
        {
            if (_camera != null && _camera.orthographic)
            {
                _camera.orthographicSize = 5f / zoom; // 5 is default size
            }
        }

        /// <summary>
        /// Convert screen point to world point
        /// </summary>
        public Vector2 ScreenToWorld(Vector2 screenPos)
        {
            return _camera.ScreenToWorldPoint(screenPos);
        }

        /// <summary>
        /// Convert world point to screen point
        /// </summary>
        public Vector2 WorldToScreen(Vector2 worldPos)
        {
            return _camera.WorldToScreenPoint(worldPos);
        }

        /// <summary>
        /// Focus on a specific world position
        /// </summary>
        public void FocusOn(Vector2 worldPos)
        {
            SetPosition(worldPos);
        }

        /// <summary>
        /// Get the transformation matrix (for compatibility with MonoGame code)
        /// </summary>
        public Matrix4x4 GetTransformationMatrix()
        {
            return _camera.worldToCameraMatrix;
        }
    }
}

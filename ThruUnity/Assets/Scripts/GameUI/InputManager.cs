using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Centralized input handling for mouse, keyboard, and gamepad.
    /// Replaces MonoGame's MouseHandler with Unity Input system.
    /// </summary>
    public class InputManager : MonoBehaviour
    {
        public static InputManager Instance { get; private set; }

        // Mouse state
        public Vector2 MousePosition { get; private set; }
        public Vector2Int MousePositionInt => new Vector2Int((int)MousePosition.x, (int)MousePosition.y);

        // Button states
        public ButtonState LeftMouseState { get; private set; }
        public ButtonState RightMouseState { get; private set; }

        // Previous frame state tracking
        private bool _prevLeftPressed;
        private bool _prevRightPressed;
        private bool _leftPressed;
        private bool _rightPressed;

        // Drag state (for inventory system)
        public bool IsDragging => DraggedItem != null;
        public object DraggedItem { get; set; } // Will be ItemIconDraggable
        public InventoryState ReceiverType { get; set; }

        private void Awake()
        {
            // Singleton pattern
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            ReceiverType = InventoryState.Mouse;
        }

        private void Update()
        {
            UpdateMousePosition();
            UpdateMouseButtons();
        }

        private void UpdateMousePosition()
        {
            // Unity's mouse position (0,0 is bottom-left, unlike MonoGame's top-left)
            // If using UI, you may want to use ScreenToWorldPoint or handle differently
            MousePosition = Input.mousePosition;
        }

        private void UpdateMouseButtons()
        {
            // Store previous states
            _prevLeftPressed = _leftPressed;
            _prevRightPressed = _rightPressed;

            // Get current states
            _leftPressed = Input.GetMouseButton(0);
            _rightPressed = Input.GetMouseButton(1);

            // Calculate button states
            LeftMouseState = CalculateButtonState(_leftPressed, _prevLeftPressed, LeftMouseState);
            RightMouseState = CalculateButtonState(_rightPressed, _prevRightPressed, RightMouseState);
        }

        private ButtonState CalculateButtonState(bool pressed, bool prevPressed, ButtonState currentState)
        {
            if (pressed)
            {
                return ButtonState.Down;
            }
            else if (!pressed && prevPressed)
            {
                // Just released
                if (currentState == ButtonState.Down)
                {
                    return ButtonState.JustReleased;
                }
            }

            return ButtonState.Hover; // Default/idle state
        }

        /// <summary>
        /// Check if a key is currently held down
        /// </summary>
        public bool IsKeyDown(KeyCode key)
        {
            return Input.GetKey(key);
        }

        /// <summary>
        /// Check if a key was just pressed this frame
        /// </summary>
        public bool IsKeyPressed(KeyCode key)
        {
            return Input.GetKeyDown(key);
        }

        /// <summary>
        /// Check if a key was just released this frame
        /// </summary>
        public bool IsKeyReleased(KeyCode key)
        {
            return Input.GetKeyUp(key);
        }

        /// <summary>
        /// Check if escape or back button was pressed (for exiting/back navigation)
        /// </summary>
        public bool IsBackPressed()
        {
            return Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.JoystickButton1);
        }

        /// <summary>
        /// Get normalized axis input (-1 to 1) for movement
        /// </summary>
        public Vector2 GetMovementInput()
        {
            return new Vector2(
                Input.GetAxis("Horizontal"),
                Input.GetAxis("Vertical")
            );
        }

        /// <summary>
        /// Check if mouse is within a rect (in screen coordinates)
        /// </summary>
        public bool IsMouseInRect(Rect rect)
        {
            return rect.Contains(MousePosition);
        }

        /// <summary>
        /// Reset drag state
        /// </summary>
        public void ClearDragState()
        {
            DraggedItem = null;
            ReceiverType = InventoryState.Mouse;
        }
    }
}

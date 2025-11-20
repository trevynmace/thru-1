using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using TMPro;
using System;

namespace Thru
{
    /// <summary>
    /// Custom button component that tracks state like the MonoGame version.
    /// Extends Unity's UI Button with state tracking (Up, Down, Hover, JustReleased).
    ///
    /// Setup:
    /// 1. Add to a UI GameObject with Image component
    /// 2. Optionally add TextMeshProUGUI as child for text
    /// </summary>
    [RequireComponent(typeof(Image))]
    public class ThruButton : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler,
        IPointerDownHandler, IPointerUpHandler, IPointerClickHandler
    {
        [Header("Button Settings")]
        public string buttonText = "";
        public string buttonId = "";

        [Header("Colors")]
        public Color normalColor = Color.white;
        public Color hoverColor = new Color(0.9f, 0.9f, 0.9f);
        public Color pressedColor = new Color(0.7f, 0.7f, 0.7f);
        public Color textColor = Color.white;

        [Header("References")]
        [Tooltip("Optional - will search in children if not set")]
        public TextMeshProUGUI textComponent;

        // State tracking (mirrors MonoGame BState)
        public ButtonState State { get; private set; } = ButtonState.Up;

        // Event for click handling
        public event Action<ThruButton> OnClick;
        public event Action<ThruButton, EventArgs> OnClickWithArgs;

        // Internal
        private Image _image;
        private bool _isHovered;
        private bool _isPressed;
        private bool _wasPressed;

        private void Awake()
        {
            _image = GetComponent<Image>();

            // Find text component if not assigned
            if (textComponent == null)
            {
                textComponent = GetComponentInChildren<TextMeshProUGUI>();
            }
        }

        private void Start()
        {
            UpdateVisuals();
            UpdateText();
        }

        private void Update()
        {
            // Track state transitions
            _wasPressed = _isPressed;
        }

        private void LateUpdate()
        {
            // Reset JustReleased state after one frame
            if (State == ButtonState.JustReleased)
            {
                State = _isHovered ? ButtonState.Hover : ButtonState.Up;
            }
        }

        #region IPointer Handlers

        public void OnPointerEnter(PointerEventData eventData)
        {
            _isHovered = true;
            if (!_isPressed)
            {
                State = ButtonState.Hover;
            }
            UpdateVisuals();
        }

        public void OnPointerExit(PointerEventData eventData)
        {
            _isHovered = false;
            if (!_isPressed)
            {
                State = ButtonState.Up;
            }
            UpdateVisuals();
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            _isPressed = true;
            State = ButtonState.Down;
            UpdateVisuals();
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (_isPressed)
            {
                _isPressed = false;
                State = ButtonState.JustReleased;
                UpdateVisuals();
            }
        }

        public void OnPointerClick(PointerEventData eventData)
        {
            // Fire events
            OnClick?.Invoke(this);
            OnClickWithArgs?.Invoke(this, EventArgs.Empty);
        }

        #endregion

        #region Visual Updates

        private void UpdateVisuals()
        {
            if (_image == null) return;

            switch (State)
            {
                case ButtonState.Up:
                    _image.color = normalColor;
                    break;
                case ButtonState.Hover:
                    _image.color = hoverColor;
                    break;
                case ButtonState.Down:
                case ButtonState.JustReleased:
                    _image.color = pressedColor;
                    break;
            }
        }

        private void UpdateText()
        {
            if (textComponent != null)
            {
                textComponent.text = buttonText;
                textComponent.color = textColor;
            }
        }

        #endregion

        #region Public Methods

        /// <summary>
        /// Set button text at runtime
        /// </summary>
        public void SetText(string text)
        {
            buttonText = text;
            UpdateText();
        }

        /// <summary>
        /// Set button colors
        /// </summary>
        public void SetColors(Color normal, Color hover, Color pressed, Color text)
        {
            normalColor = normal;
            hoverColor = hover;
            pressedColor = pressed;
            textColor = text;
            UpdateVisuals();
            UpdateText();
        }

        /// <summary>
        /// Check if button was just clicked (use in Update loops)
        /// </summary>
        public bool WasJustReleased()
        {
            return State == ButtonState.JustReleased;
        }

        #endregion
    }

    /// <summary>
    /// Layout arrangement options for ButtonGroup
    /// </summary>
    public enum ButtonArrangement
    {
        Horizontal,
        Vertical
    }
}

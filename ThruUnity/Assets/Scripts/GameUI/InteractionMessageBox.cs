using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace Thru
{
    /// <summary>
    /// Message box for displaying text with title.
    /// Replaces MonoGame's InteractionMessageBox.
    /// </summary>
    public class InteractionMessageBox : MonoBehaviour
    {
        [Header("UI References")]
        public TextMeshProUGUI titleText;
        public TextMeshProUGUI messageText;
        public Image backgroundImage;

        [Header("Settings")]
        public Color backgroundColor = new Color(0, 0, 0, 0.8f);
        public int maxWidth = 1000;
        public int maxHeight = 150;

        [Header("Content")]
        public string Title;
        public string Message;

        private RectTransform _rectTransform;

        private void Awake()
        {
            _rectTransform = GetComponent<RectTransform>();
        }

        private void Start()
        {
            UpdateDisplay();
        }

        /// <summary>
        /// Set message content
        /// </summary>
        public void SetContent(string title, string message)
        {
            Title = title;
            Message = message;
            UpdateDisplay();
        }

        /// <summary>
        /// Update the display
        /// </summary>
        public void UpdateDisplay()
        {
            if (titleText != null)
                titleText.text = Title;

            if (messageText != null)
                messageText.text = Message;

            if (backgroundImage != null)
                backgroundImage.color = backgroundColor;
        }

        /// <summary>
        /// Show the message box
        /// </summary>
        public void Show()
        {
            gameObject.SetActive(true);
        }

        /// <summary>
        /// Hide the message box
        /// </summary>
        public void Hide()
        {
            gameObject.SetActive(false);
        }

        /// <summary>
        /// Show message box with content
        /// </summary>
        public void Show(string title, string message)
        {
            SetContent(title, message);
            Show();
        }
    }
}

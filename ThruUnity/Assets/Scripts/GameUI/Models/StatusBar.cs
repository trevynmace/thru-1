using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace Thru
{
    /// <summary>
    /// Status bar UI component showing health, stamina, etc.
    /// Replaces MonoGame's StatusBar.
    /// </summary>
    public class StatusBar : MonoBehaviour
    {
        [Header("Bar Settings")]
        public string statName = "Health";
        public Color fillColor = Color.green;
        public Color backgroundColor = Color.gray;

        [Header("UI References")]
        public Image fillImage;
        public Image backgroundImage;
        public TextMeshProUGUI labelText;
        public TextMeshProUGUI valueText;

        [Header("Values")]
        [SerializeField] private float _currentValue = 100;
        [SerializeField] private float _maxValue = 100;

        public float CurrentValue
        {
            get => _currentValue;
            set
            {
                _currentValue = Mathf.Clamp(value, 0, _maxValue);
                UpdateVisuals();
            }
        }

        public float MaxValue
        {
            get => _maxValue;
            set
            {
                _maxValue = Mathf.Max(1, value);
                _currentValue = Mathf.Clamp(_currentValue, 0, _maxValue);
                UpdateVisuals();
            }
        }

        public float FillAmount => _maxValue > 0 ? _currentValue / _maxValue : 0;

        private void Start()
        {
            UpdateVisuals();
        }

        /// <summary>
        /// Set values and update display
        /// </summary>
        public void SetValues(float current, float max)
        {
            _maxValue = Mathf.Max(1, max);
            _currentValue = Mathf.Clamp(current, 0, _maxValue);
            UpdateVisuals();
        }

        private void UpdateVisuals()
        {
            // Update fill bar
            if (fillImage != null)
            {
                fillImage.fillAmount = FillAmount;
                fillImage.color = fillColor;
            }

            if (backgroundImage != null)
            {
                backgroundImage.color = backgroundColor;
            }

            // Update label
            if (labelText != null)
            {
                labelText.text = statName;
            }

            // Update value text
            if (valueText != null)
            {
                valueText.text = $"{Mathf.RoundToInt(_currentValue)}/{Mathf.RoundToInt(_maxValue)}";
            }
        }

        /// <summary>
        /// Animate change in value
        /// </summary>
        public void AnimateChange(float newValue, float duration = 0.3f)
        {
            StopAllCoroutines();
            StartCoroutine(AnimateValueCoroutine(newValue, duration));
        }

        private System.Collections.IEnumerator AnimateValueCoroutine(float targetValue, float duration)
        {
            float startValue = _currentValue;
            float elapsed = 0f;

            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                float t = elapsed / duration;
                _currentValue = Mathf.Lerp(startValue, targetValue, t);
                UpdateVisuals();
                yield return null;
            }

            _currentValue = targetValue;
            UpdateVisuals();
        }
    }
}

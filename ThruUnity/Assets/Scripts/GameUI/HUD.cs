using UnityEngine;
using TMPro;

namespace Thru
{
    /// <summary>
    /// Heads-Up Display showing player stats and info.
    /// Replaces MonoGame's HUD.
    /// </summary>
    public class HUD : MonoBehaviour
    {
        [Header("Status Bars")]
        public StatusBar healthBar;
        public StatusBar staminaBar;

        [Header("Player Info")]
        public TextMeshProUGUI playerNameText;
        public TextMeshProUGUI locationText;
        public TextMeshProUGUI daysText;

        [Header("Stats Display")]
        public TextMeshProUGUI strengthText;
        public TextMeshProUGUI enduranceText;
        public TextMeshProUGUI speedText;
        public TextMeshProUGUI luckText;
        public TextMeshProUGUI charismaText;

        private GameStateManager _stateManager;

        private void Start()
        {
            _stateManager = GameStateManager.Instance;
        }

        private void Update()
        {
            UpdateDisplay();
        }

        /// <summary>
        /// Update all HUD elements
        /// </summary>
        public void UpdateDisplay()
        {
            if (_stateManager == null || _stateManager.Player == null) return;

            var player = _stateManager.Player;
            var stats = player.Stats;

            // Update status bars
            if (healthBar != null && stats != null)
            {
                healthBar.SetValues(stats.Health, stats.MaxHealth);
            }

            if (staminaBar != null && stats != null)
            {
                staminaBar.SetValues(stats.Stamina, stats.MaxStamina);
            }

            // Update player info
            if (playerNameText != null)
            {
                playerNameText.text = player.Name;
            }

            if (locationText != null && player.Location != null)
            {
                locationText.text = player.Location.Name;
            }

            if (daysText != null)
            {
                daysText.text = $"Day {_stateManager.Days}";
            }

            // Update stats
            if (stats != null)
            {
                if (strengthText != null)
                    strengthText.text = $"STR: {stats.Strength}";
                if (enduranceText != null)
                    enduranceText.text = $"END: {stats.Endurance}";
                if (speedText != null)
                    speedText.text = $"SPD: {stats.Speed}";
                if (luckText != null)
                    luckText.text = $"LCK: {stats.Luck}";
                if (charismaText != null)
                    charismaText.text = $"CHA: {stats.Charisma}";
            }
        }

        /// <summary>
        /// Show damage effect
        /// </summary>
        public void ShowDamage(int amount)
        {
            if (healthBar != null)
            {
                healthBar.AnimateChange(healthBar.CurrentValue - amount);
            }
        }

        /// <summary>
        /// Show healing effect
        /// </summary>
        public void ShowHeal(int amount)
        {
            if (healthBar != null)
            {
                healthBar.AnimateChange(healthBar.CurrentValue + amount);
            }
        }
    }
}

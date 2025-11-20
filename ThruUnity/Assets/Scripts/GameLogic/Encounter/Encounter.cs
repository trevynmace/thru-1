using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections.Generic;

namespace Thru
{
    /// <summary>
    /// Encounter with choices and dice-roll resolution.
    /// Replaces MonoGame's Encounter.
    /// </summary>
    public class Encounter : MonoBehaviour
    {
        [Header("Data")]
        public string encounterTitle;
        public string encounterMessage;
        public Location location;

        [Header("State")]
        public bool selectionMade;
        public bool isResolved;

        [Header("UI References")]
        public TextMeshProUGUI titleText;
        public TextMeshProUGUI messageText;
        public Transform optionButtonContainer;
        public GameObject optionButtonPrefab;
        public Button okButton;

        // Runtime data
        private Character _character;
        private Dictionary<string, EncounterOptionData> _options = new Dictionary<string, EncounterOptionData>();
        private List<Button> _optionButtons = new List<Button>();

        /// <summary>
        /// Initialize encounter from data
        /// </summary>
        public void Initialize(Character player, EncounterData data, Location loc)
        {
            _character = player;
            location = loc;
            encounterTitle = data.title;
            encounterMessage = data.text;

            // Clear existing options
            foreach (var btn in _optionButtons)
            {
                if (btn != null)
                    Destroy(btn.gameObject);
            }
            _optionButtons.Clear();
            _options.Clear();

            // Create option buttons
            foreach (var option in data.options)
            {
                CreateOptionButton(option);
            }

            // Set up OK button
            if (okButton != null)
            {
                okButton.gameObject.SetActive(false);
                okButton.onClick.RemoveAllListeners();
                okButton.onClick.AddListener(OnOkClicked);
            }

            UpdateUI();
            selectionMade = false;
            isResolved = false;
        }

        private void CreateOptionButton(EncounterOptionData option)
        {
            GameObject btnObj;
            if (optionButtonPrefab != null)
            {
                btnObj = Instantiate(optionButtonPrefab, optionButtonContainer);
            }
            else
            {
                btnObj = new GameObject($"Option_{option.text}");
                btnObj.transform.SetParent(optionButtonContainer, false);
                btnObj.AddComponent<RectTransform>();
                btnObj.AddComponent<Image>();
                btnObj.AddComponent<Button>();

                var textObj = new GameObject("Text");
                textObj.transform.SetParent(btnObj.transform, false);
                var tmp = textObj.AddComponent<TextMeshProUGUI>();
                tmp.alignment = TextAlignmentOptions.Center;
            }

            // Set text
            var buttonText = btnObj.GetComponentInChildren<TextMeshProUGUI>();
            if (buttonText != null)
                buttonText.text = option.text;

            // Add click handler
            var button = btnObj.GetComponent<Button>();
            string optionText = option.text; // Capture for closure
            button.onClick.AddListener(() => OnOptionSelected(optionText));

            _optionButtons.Add(button);
            _options[option.text] = option;
        }

        private void OnOptionSelected(string optionText)
        {
            if (selectionMade) return;

            if (_options.TryGetValue(optionText, out EncounterOptionData option))
            {
                RollEncounter(option);
            }
        }

        private void OnOkClicked()
        {
            if (selectionMade)
            {
                isResolved = true;
                gameObject.SetActive(false);
            }
        }

        /// <summary>
        /// Roll dice check and resolve encounter
        /// </summary>
        private bool RollEncounter(EncounterOptionData option)
        {
            selectionMade = true;

            // Hide option buttons, show OK button
            foreach (var btn in _optionButtons)
                btn.gameObject.SetActive(false);

            if (okButton != null)
                okButton.gameObject.SetActive(true);

            // Get stat value
            int stat = GetStatValue(option.checkStat);

            // Roll d20 + stat vs DC
            int roll = Random.Range(1, 21);
            bool success = (stat + roll) >= option.diceCheck;

            if (success)
            {
                encounterTitle = "Success!";
                encounterMessage = $"{_character.Name} uses their superior {option.checkStat} to their advantage. {_character.Name} Succeeds!";
                ResolveEncounter(option.success);
            }
            else
            {
                encounterTitle = "Failure!";
                encounterMessage = $"{_character.Name} isn't quite {option.checkStat}-y enough to get the job done. {_character.Name} Fails!";
                ResolveEncounter(option.failure);
            }

            UpdateUI();

            Debug.Log($"Encounter roll: {roll} + {stat} ({option.checkStat}) vs DC {option.diceCheck} = {(success ? "Success" : "Failure")}");

            return success;
        }

        private void ResolveEncounter(EncounterResolutionData resolution)
        {
            if (resolution == null || _character == null) return;

            int currentValue = GetStatValue(resolution.effectedStat);
            SetStatValue(resolution.effectedStat, currentValue + resolution.effect);

            Debug.Log($"Applied {resolution.effect} to {resolution.effectedStat}");
        }

        private int GetStatValue(string statName)
        {
            if (_character == null || _character.Stats == null) return 0;

            // Use reflection or switch to get stat
            var stats = _character.Stats;
            switch (statName?.ToLower())
            {
                case "strength": return stats.Strength;
                case "endurance": return stats.Endurance;
                case "speed": return stats.Speed;
                case "luck": return stats.Luck;
                case "charisma": return stats.Charisma;
                case "health": return stats.Health;
                case "stamina": return stats.Stamina;
                default: return 10;
            }
        }

        private void SetStatValue(string statName, int value)
        {
            if (_character == null || _character.Stats == null) return;

            var stats = _character.Stats;
            switch (statName?.ToLower())
            {
                case "strength": stats.Strength = value; break;
                case "endurance": stats.Endurance = value; break;
                case "speed": stats.Speed = value; break;
                case "luck": stats.Luck = value; break;
                case "charisma": stats.Charisma = value; break;
                case "health": stats.Health = Mathf.Clamp(value, 0, stats.MaxHealth); break;
                case "stamina": stats.Stamina = Mathf.Clamp(value, 0, stats.MaxStamina); break;
            }
        }

        private void UpdateUI()
        {
            if (titleText != null)
                titleText.text = encounterTitle;
            if (messageText != null)
                messageText.text = encounterMessage;
        }
    }

    /// <summary>
    /// Data for encounter loaded from JSON
    /// </summary>
    [System.Serializable]
    public class EncounterData
    {
        public string title;
        public string text;
        public EncounterOptionData[] options;
        public float dropRate;
        public Tags[] encounterTags;
        public ResolutionType resolutionType;
    }

    [System.Serializable]
    public class EncounterOptionData
    {
        public string text;
        public string checkStat;
        public int diceCheck;
        public EncounterResolutionData success;
        public EncounterResolutionData failure;
    }

    [System.Serializable]
    public class EncounterResolutionData
    {
        public string effectedStat;
        public int effect;
    }

    public enum ResolutionType
    {
        Cutscene,
        Duo,
        Leader,
        PVP,
        PVE,
        Quadruple,
        Random,
        SimpleMajority,
        Tramily,
        Triple
    }

    public enum Tags
    {
        Trail,
        Town,
        Road,
        Water,
        Camp
    }
}

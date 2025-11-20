using UnityEngine;
using System.Collections.Generic;
using System.IO;

namespace Thru
{
    /// <summary>
    /// Factory class for creating characters with random names.
    /// Replaces MonoGame's CharacterBuilder.
    /// </summary>
    public class CharacterBuilder
    {
        private Dictionary<string, FirstNameData> _nameDict;
        private List<string> _nameList;

        [Header("Prefabs")]
        public GameObject characterPrefab;

        public Character Character { get; private set; }

        /// <summary>
        /// Create a CharacterBuilder and generate a character
        /// </summary>
        public CharacterBuilder(Vector2 screenPosition, GameObject characterPrefab = null)
        {
            this.characterPrefab = characterPrefab;

            // Load name data
            LoadNameData();

            // Create the character
            Character = CreateCharacter(screenPosition);
        }

        private void LoadNameData()
        {
            _nameDict = new Dictionary<string, FirstNameData>();
            _nameList = new List<string>();

            // Try to load from Resources first
            TextAsset jsonAsset = Resources.Load<TextAsset>("Data/first_name_list");

            string jsonText;
            if (jsonAsset != null)
            {
                jsonText = jsonAsset.text;
            }
            else
            {
                // Fall back to StreamingAssets
                string path = Path.Combine(Application.streamingAssetsPath, "first_name_list.json");
                if (File.Exists(path))
                {
                    jsonText = File.ReadAllText(path);
                }
                else
                {
                    Debug.LogWarning("Could not find first_name_list.json - using default names");
                    SetupDefaultNames();
                    return;
                }
            }

            // Parse JSON - expecting format: { "Name": { "female": 50, "male": 50, "most_likely": "female" }, ... }
            // Using simple parsing since Unity's JsonUtility doesn't support Dictionary directly
            // For production, use Newtonsoft.Json
            try
            {
                // This is a simplified approach - in production use Newtonsoft.Json
                var wrapper = JsonUtility.FromJson<FirstNameListWrapper>("{\"names\":" + jsonText + "}");
                if (wrapper != null && wrapper.names != null)
                {
                    foreach (var entry in wrapper.names)
                    {
                        _nameDict[entry.name] = entry;
                        _nameList.Add(entry.name);
                    }
                }
            }
            catch
            {
                Debug.LogWarning("Failed to parse name data - using defaults");
                SetupDefaultNames();
            }

            if (_nameList.Count == 0)
            {
                SetupDefaultNames();
            }
        }

        private void SetupDefaultNames()
        {
            // Default names if JSON loading fails
            string[] defaultNames = { "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Avery" };

            foreach (var name in defaultNames)
            {
                _nameDict[name] = new FirstNameData
                {
                    name = name,
                    female = 50,
                    male = 50,
                    most_likely = "neutral"
                };
                _nameList.Add(name);
            }
        }

        /// <summary>
        /// Create a new character with random name and gender
        /// </summary>
        public Character CreateCharacter(Vector2 screenPosition)
        {
            // Pick random name
            string name = _nameList[Random.Range(0, _nameList.Count)];

            // Determine gender based on name data
            Genders gender = Genders.NonBinary;
            if (_nameDict.TryGetValue(name, out FirstNameData nameData))
            {
                if (nameData.most_likely == "male")
                    gender = Genders.Male;
                else if (nameData.most_likely == "female")
                    gender = Genders.Female;
            }

            // Create character
            var character = new Character(name, gender);
            character.ScreenPosition = screenPosition;

            Debug.Log($"Created character: {name} ({gender})");

            return character;
        }

        /// <summary>
        /// Create a character with a specific name
        /// </summary>
        public Character CreateCharacter(string name, Vector2 screenPosition)
        {
            Genders gender = Genders.NonBinary;
            if (_nameDict.TryGetValue(name, out FirstNameData nameData))
            {
                if (nameData.most_likely == "male")
                    gender = Genders.Male;
                else if (nameData.most_likely == "female")
                    gender = Genders.Female;
            }

            var character = new Character(name, gender);
            character.ScreenPosition = screenPosition;

            return character;
        }

        /// <summary>
        /// Instantiate a character GameObject with CharacterModel
        /// </summary>
        public GameObject InstantiateCharacterModel(Character character, Transform parent = null)
        {
            GameObject charObj;

            if (characterPrefab != null)
            {
                charObj = Object.Instantiate(characterPrefab, parent);
            }
            else
            {
                charObj = new GameObject($"Character_{character.Name}");
                if (parent != null)
                    charObj.transform.SetParent(parent);

                // Add CharacterModel component
                charObj.AddComponent<CharacterModel>();
            }

            // Initialize the model
            var model = charObj.GetComponent<CharacterModel>();
            if (model != null)
            {
                model.Initialize(character);
            }

            // Store reference
            character.CharacterModel = charObj;

            return charObj;
        }
    }

    /// <summary>
    /// Data structure for name statistics
    /// </summary>
    [System.Serializable]
    public class FirstNameData
    {
        public string name;
        public int female;
        public int male;
        public string most_likely;
    }

    /// <summary>
    /// Wrapper for JSON array parsing
    /// </summary>
    [System.Serializable]
    public class FirstNameListWrapper
    {
        public FirstNameData[] names;
    }
}

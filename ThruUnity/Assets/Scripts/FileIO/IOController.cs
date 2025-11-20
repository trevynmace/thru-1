using UnityEngine;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace Thru
{
    /// <summary>
    /// Handles JSON serialization and file I/O.
    /// Replaces MonoGame's IOController.
    ///
    /// Uses Newtonsoft.Json for full JSON support including Dictionaries.
    /// Falls back to Unity's JsonUtility if Newtonsoft is unavailable.
    /// </summary>
    public class IOController
    {
        private string _basePath;

        public IOController()
        {
            // Default to StreamingAssets for runtime-readable files
            _basePath = Application.streamingAssetsPath;
        }

        public IOController(string basePath)
        {
            _basePath = basePath;
        }

        /// <summary>
        /// Deserialize JSON file to object
        /// </summary>
        public T DeserializeFromFile<T>(string filename)
        {
            string path = Path.Combine(_basePath, filename);

            if (!File.Exists(path))
            {
                Debug.LogError($"File not found: {path}");
                return default(T);
            }

            string jsonString = File.ReadAllText(path);

            // Use Newtonsoft.Json for full JSON support (Dictionaries, complex types)
            return JsonConvert.DeserializeObject<T>(jsonString);
        }

        /// <summary>
        /// Serialize object to JSON file
        /// </summary>
        public void SerializeToFile<T>(string filename, T obj)
        {
            string path = Path.Combine(_basePath, filename);

            // Create directory if needed
            string directory = Path.GetDirectoryName(path);
            if (!Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            string jsonString = JsonConvert.SerializeObject(obj, Formatting.Indented);
            File.WriteAllText(path, jsonString);

            Debug.Log($"Saved to: {path}");
        }

        /// <summary>
        /// Load text asset from Resources folder
        /// </summary>
        public static string LoadFromResources(string path)
        {
            TextAsset textAsset = Resources.Load<TextAsset>(path);
            if (textAsset != null)
            {
                return textAsset.text;
            }
            Debug.LogError($"Resource not found: {path}");
            return null;
        }

        /// <summary>
        /// Deserialize JSON from Resources folder
        /// </summary>
        public static T DeserializeFromResources<T>(string path)
        {
            string json = LoadFromResources(path);
            if (!string.IsNullOrEmpty(json))
            {
                return JsonConvert.DeserializeObject<T>(json);
            }
            return default(T);
        }
    }
}

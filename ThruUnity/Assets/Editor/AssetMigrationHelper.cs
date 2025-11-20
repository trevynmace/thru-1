using UnityEngine;
using UnityEditor;
using System.IO;

namespace Thru.Editor
{
    /// <summary>
    /// Helper tool to migrate assets from MonoGame Content folder to Unity.
    /// </summary>
    public class AssetMigrationHelper : EditorWindow
    {
        private string _monoGameContentPath = "";
        private bool _importSprites = true;
        private bool _importAudio = true;
        private bool _importData = true;

        [MenuItem("Thru/Asset Migration Helper")]
        public static void ShowWindow()
        {
            GetWindow<AssetMigrationHelper>("Asset Migration");
        }

        private void OnEnable()
        {
            // Try to auto-detect MonoGame content path
            string projectPath = Path.GetDirectoryName(Application.dataPath);
            string parentPath = Path.GetDirectoryName(projectPath);
            string possiblePath = Path.Combine(parentPath, "Thru", "Content");

            if (Directory.Exists(possiblePath))
            {
                _monoGameContentPath = possiblePath;
            }
        }

        private void OnGUI()
        {
            GUILayout.Label("MonoGame Asset Migration", EditorStyles.boldLabel);
            EditorGUILayout.Space();

            EditorGUILayout.HelpBox(
                "This tool helps migrate assets from your MonoGame Content folder to Unity.\n\n" +
                "Note: PNG files can be copied directly. Audio files may need conversion.",
                MessageType.Info);

            EditorGUILayout.Space();

            // Path selection
            EditorGUILayout.BeginHorizontal();
            _monoGameContentPath = EditorGUILayout.TextField("MonoGame Content Path", _monoGameContentPath);
            if (GUILayout.Button("Browse", GUILayout.Width(60)))
            {
                string selected = EditorUtility.OpenFolderPanel("Select MonoGame Content Folder", _monoGameContentPath, "");
                if (!string.IsNullOrEmpty(selected))
                {
                    _monoGameContentPath = selected;
                }
            }
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.Space();

            // Options
            _importSprites = EditorGUILayout.Toggle("Import Sprites (PNG)", _importSprites);
            _importAudio = EditorGUILayout.Toggle("Import Audio", _importAudio);
            _importData = EditorGUILayout.Toggle("Import Data (JSON)", _importData);

            EditorGUILayout.Space();

            if (GUILayout.Button("Analyze Content Folder", GUILayout.Height(30)))
            {
                AnalyzeContentFolder();
            }

            if (GUILayout.Button("Migrate Assets", GUILayout.Height(40)))
            {
                MigrateAssets();
            }

            EditorGUILayout.Space();
            GUILayout.Label("Manual Import Instructions", EditorStyles.boldLabel);

            EditorGUILayout.HelpBox(
                "For sprites:\n" +
                "1. Copy PNG files from Content/ to Assets/Sprites/\n" +
                "2. Select imported sprites in Unity\n" +
                "3. Set 'Texture Type' to 'Sprite (2D and UI)'\n" +
                "4. For spritesheets, use Sprite Editor to slice\n\n" +
                "For audio:\n" +
                "1. Copy WAV/MP3 files to Assets/Audio/\n" +
                "2. Unity will auto-import them\n\n" +
                "For fonts:\n" +
                "1. Copy TTF files to Assets/Fonts/\n" +
                "2. Create TextMeshPro font assets",
                MessageType.None);
        }

        private void AnalyzeContentFolder()
        {
            if (!Directory.Exists(_monoGameContentPath))
            {
                EditorUtility.DisplayDialog("Error", "Content folder not found!", "OK");
                return;
            }

            int pngCount = Directory.GetFiles(_monoGameContentPath, "*.png", SearchOption.AllDirectories).Length;
            int wavCount = Directory.GetFiles(_monoGameContentPath, "*.wav", SearchOption.AllDirectories).Length;
            int mp3Count = Directory.GetFiles(_monoGameContentPath, "*.mp3", SearchOption.AllDirectories).Length;
            int jsonCount = Directory.GetFiles(_monoGameContentPath, "*.json", SearchOption.AllDirectories).Length;
            int ttfCount = Directory.GetFiles(_monoGameContentPath, "*.ttf", SearchOption.AllDirectories).Length;

            string message = $"Content Analysis:\n\n" +
                           $"PNG Sprites: {pngCount}\n" +
                           $"WAV Audio: {wavCount}\n" +
                           $"MP3 Audio: {mp3Count}\n" +
                           $"JSON Data: {jsonCount}\n" +
                           $"TTF Fonts: {ttfCount}\n\n" +
                           $"Total files to migrate: {pngCount + wavCount + mp3Count + jsonCount + ttfCount}";

            EditorUtility.DisplayDialog("Content Analysis", message, "OK");
        }

        private void MigrateAssets()
        {
            if (!Directory.Exists(_monoGameContentPath))
            {
                EditorUtility.DisplayDialog("Error", "Content folder not found!", "OK");
                return;
            }

            int copied = 0;

            // Sprites
            if (_importSprites)
            {
                copied += CopyFiles("*.png", "CharacterModels", "Resources/CharacterModels");
                copied += CopyFiles("*.png", "ItemIcons", "Resources/ItemIcons");
                copied += CopyFiles("*.png", "Backgrounds", "Resources/Backgrounds");
                copied += CopyFiles("*.png", "InterfaceTextures", "Sprites/UI");
            }

            // Audio
            if (_importAudio)
            {
                copied += CopyFiles("*.wav", "Audio", "Audio");
                copied += CopyFiles("*.mp3", "Audio", "Audio");
            }

            // Data
            if (_importData)
            {
                copied += CopyFiles("*.json", "DataLists", "Resources/Data");
                copied += CopyFiles("*.json", "GameData", "Resources/Data");
            }

            // Fonts
            copied += CopyFiles("*.ttf", "Fonts", "Fonts");

            AssetDatabase.Refresh();

            EditorUtility.DisplayDialog("Migration Complete",
                $"Copied {copied} files to Unity project.\n\n" +
                "Remember to configure sprite import settings!",
                "OK");
        }

        private int CopyFiles(string pattern, string sourceSubFolder, string destSubFolder)
        {
            string sourcePath = Path.Combine(_monoGameContentPath, sourceSubFolder);
            string destPath = Path.Combine(Application.dataPath, destSubFolder);

            if (!Directory.Exists(sourcePath))
                return 0;

            if (!Directory.Exists(destPath))
                Directory.CreateDirectory(destPath);

            string[] files = Directory.GetFiles(sourcePath, pattern, SearchOption.AllDirectories);
            int count = 0;

            foreach (string file in files)
            {
                string fileName = Path.GetFileName(file);
                string destFile = Path.Combine(destPath, fileName);

                try
                {
                    File.Copy(file, destFile, true);
                    count++;
                }
                catch (System.Exception e)
                {
                    Debug.LogWarning($"Failed to copy {fileName}: {e.Message}");
                }
            }

            return count;
        }
    }
}

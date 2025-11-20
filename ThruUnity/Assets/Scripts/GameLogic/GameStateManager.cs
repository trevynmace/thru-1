using System;
using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Central game state manager that controls application flow.
    /// Replaces MonoGame's GlobalState class.
    /// Manages which views are active and handles state transitions.
    /// </summary>
    public class GameStateManager : MonoBehaviour
    {
        public static GameStateManager Instance { get; private set; }

        [Header("Current States")]
        [SerializeField] private GameState _currentState = GameState.Menu;
        [SerializeField] private PlayState _currentPlayState = PlayState.Play;

        [Header("View References")]
        [Tooltip("Assign these in the Inspector or find them at runtime")]
        public GameObject mainMenuView;
        public GameObject mainSettingsView;
        public GameObject characterCreationView;
        public GameObject gameView;

        [Header("Game Data")]
        public Character Player;
        public Location CurrentLocation;
        public int Days;

        [Header("Screen Settings")]
        public int WindowWidth;
        public int WindowHeight;

        // Events for state changes
        public event Action<GameState, GameState> OnGameStateChanged;
        public event Action<PlayState, PlayState> OnPlayStateChanged;

        // View interfaces (will be populated from GameObjects)
        private IView _menuViewComponent;
        private IView _settingsViewComponent;
        private IView _characterCreationViewComponent;
        private IView _gameViewComponent;

        public GameState CurrentState
        {
            get => _currentState;
            set
            {
                if (_currentState != value)
                {
                    var oldState = _currentState;
                    _currentState = value;
                    Debug.Log($"State changed from {oldState} to {value}");
                    OnGameStateChanged?.Invoke(oldState, value);
                    UpdateActiveView();
                }
            }
        }

        public PlayState CurrentPlayState
        {
            get => _currentPlayState;
            set
            {
                if (_currentPlayState != value)
                {
                    var oldState = _currentPlayState;
                    _currentPlayState = value;
                    Debug.Log($"Play state changed from {oldState} to {value}");
                    OnPlayStateChanged?.Invoke(oldState, value);
                }
            }
        }

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

            // Get screen dimensions
            WindowWidth = Screen.width;
            WindowHeight = Screen.height;
        }

        private void Start()
        {
            InitializeViews();
            UpdateActiveView();
        }

        private void Update()
        {
            // Handle escape key for quitting (mirrors MonoGame behavior)
            if (InputManager.Instance != null && InputManager.Instance.IsBackPressed())
            {
                HandleBackButton();
            }

            // Update the current active view
            RunCurrentStateUpdate();
        }

        private void InitializeViews()
        {
            // Get IView components from GameObjects
            if (mainMenuView != null)
            {
                _menuViewComponent = mainMenuView.GetComponent<IView>();
                _menuViewComponent?.Initialize(this);
            }

            if (mainSettingsView != null)
            {
                _settingsViewComponent = mainSettingsView.GetComponent<IView>();
                _settingsViewComponent?.Initialize(this);
            }

            if (characterCreationView != null)
            {
                _characterCreationViewComponent = characterCreationView.GetComponent<IView>();
                _characterCreationViewComponent?.Initialize(this);
            }

            if (gameView != null)
            {
                _gameViewComponent = gameView.GetComponent<IView>();
                _gameViewComponent?.Initialize(this);
            }
        }

        private void RunCurrentStateUpdate()
        {
            GameState? newState = null;

            switch (_currentState)
            {
                case GameState.Menu:
                    newState = _menuViewComponent?.UpdateView();
                    break;
                case GameState.MainSettings:
                    newState = _settingsViewComponent?.UpdateView();
                    break;
                case GameState.Game:
                    newState = _gameViewComponent?.UpdateView();
                    break;
                case GameState.CharacterCreation:
                    newState = _characterCreationViewComponent?.UpdateView();
                    break;
                default:
                    Debug.LogWarning($"Unhandled state: {_currentState}");
                    break;
            }

            // If view returns a different state, transition to it
            if (newState.HasValue && newState.Value != _currentState)
            {
                CurrentState = newState.Value;
            }
        }

        private void UpdateActiveView()
        {
            // Hide all views
            HideAllViews();

            // Show the current view
            switch (_currentState)
            {
                case GameState.Menu:
                    _menuViewComponent?.Show();
                    break;
                case GameState.MainSettings:
                    _settingsViewComponent?.Show();
                    break;
                case GameState.Game:
                    _gameViewComponent?.Show();
                    break;
                case GameState.CharacterCreation:
                    _characterCreationViewComponent?.Show();
                    break;
            }
        }

        private void HideAllViews()
        {
            _menuViewComponent?.Hide();
            _settingsViewComponent?.Hide();
            _gameViewComponent?.Hide();
            _characterCreationViewComponent?.Hide();
        }

        private void HandleBackButton()
        {
            // Context-sensitive back button behavior
            switch (_currentState)
            {
                case GameState.Menu:
                    // Quit game from main menu
#if UNITY_EDITOR
                    UnityEditor.EditorApplication.isPlaying = false;
#else
                    Application.Quit();
#endif
                    break;
                case GameState.MainSettings:
                case GameState.CharacterCreation:
                    // Return to menu
                    CurrentState = GameState.Menu;
                    break;
                case GameState.Game:
                    // Could open pause menu or return to menu
                    // For now, just return to menu
                    CurrentState = GameState.Menu;
                    break;
            }
        }

        #region State Change Event Handlers (for button bindings)

        public void GoToMenu()
        {
            CurrentState = GameState.Menu;
        }

        public void GoToGame()
        {
            CurrentState = GameState.Game;
        }

        public void GoToCharacterCreation()
        {
            CurrentState = GameState.CharacterCreation;
        }

        public void GoToMainSettings()
        {
            CurrentState = GameState.MainSettings;
        }

        public void QuitGame()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        #endregion

        #region Character Setup

        /// <summary>
        /// Create a test player character (mirrors setupTestPlayer from MonoGame version)
        /// </summary>
        public void SetupTestPlayer(Vector2 screenPosition)
        {
            // TODO: Implement CharacterBuilder and create player
            // CharacterBuilder builder = new CharacterBuilder(screenPosition);
            // Player = builder.Character;
            Debug.Log("SetupTestPlayer called - CharacterBuilder not yet implemented");
        }

        #endregion
    }
}

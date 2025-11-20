using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Main menu view implementation.
    /// Replaces MonoGame's MainMenuView.
    ///
    /// In Unity, this is a MonoBehaviour attached to a Canvas or panel GameObject.
    /// The Canvas handles rendering - no need for SpriteBatch.Draw calls.
    /// </summary>
    public class MainMenuView : MonoBehaviour, IView
    {
        [Header("UI References")]
        [Tooltip("The animated background sprite")]
        public SpriteAnimator backgroundAnimator;

        [Tooltip("Button group containing menu buttons")]
        public ThruButtonGroup buttonGroup;

        [Header("Buttons")]
        public ThruButton newGameButton;
        public ThruButton continueButton;
        public ThruButton settingsButton;
        public ThruButton quitButton;

        // Reference to state manager
        private GameStateManager _stateManager;

        // The CanvasGroup for show/hide (optional but useful)
        private CanvasGroup _canvasGroup;

        private void Awake()
        {
            _canvasGroup = GetComponent<CanvasGroup>();
        }

        public void Initialize(GameStateManager stateManager)
        {
            _stateManager = stateManager;

            // Wire up button click events
            if (newGameButton != null)
            {
                newGameButton.OnClick += OnNewGameClicked;
            }

            if (continueButton != null)
            {
                continueButton.OnClick += OnContinueClicked;
            }

            if (settingsButton != null)
            {
                settingsButton.OnClick += OnSettingsClicked;
            }

            if (quitButton != null)
            {
                quitButton.OnClick += OnQuitClicked;
            }
        }

        public void Show()
        {
            gameObject.SetActive(true);

            // Optional: Use CanvasGroup for fade effects
            if (_canvasGroup != null)
            {
                _canvasGroup.alpha = 1f;
                _canvasGroup.interactable = true;
                _canvasGroup.blocksRaycasts = true;
            }
        }

        public void Hide()
        {
            // Optional: Use CanvasGroup for fade effects
            if (_canvasGroup != null)
            {
                _canvasGroup.alpha = 0f;
                _canvasGroup.interactable = false;
                _canvasGroup.blocksRaycasts = false;
            }

            gameObject.SetActive(false);
        }

        /// <summary>
        /// Called every frame when this view is active.
        /// Returns the state to transition to (or current state to stay).
        /// </summary>
        public GameState UpdateView()
        {
            // In Unity, buttons handle their own click events via OnClick
            // But you can also poll button state here if preferred:

            // Example polling approach (like MonoGame):
            // if (newGameButton != null && newGameButton.WasJustReleased())
            // {
            //     return GameState.CharacterCreation;
            // }

            // Return current state to stay in menu
            return GameState.Menu;
        }

        #region Button Event Handlers

        private void OnNewGameClicked(ThruButton button)
        {
            Debug.Log("New Game clicked");

            // Transition to character creation
            if (_stateManager != null)
            {
                _stateManager.CurrentState = GameState.CharacterCreation;
            }
        }

        private void OnContinueClicked(ThruButton button)
        {
            Debug.Log("Continue clicked");

            // Load saved game and go to game
            if (_stateManager != null)
            {
                // TODO: Load saved game data
                _stateManager.CurrentState = GameState.Game;
            }
        }

        private void OnSettingsClicked(ThruButton button)
        {
            Debug.Log("Settings clicked");

            // Go to settings
            if (_stateManager != null)
            {
                _stateManager.CurrentState = GameState.MainSettings;
            }
        }

        private void OnQuitClicked(ThruButton button)
        {
            Debug.Log("Quit clicked");

            if (_stateManager != null)
            {
                _stateManager.QuitGame();
            }
        }

        #endregion

        private void OnDestroy()
        {
            // Clean up event subscriptions
            if (newGameButton != null) newGameButton.OnClick -= OnNewGameClicked;
            if (continueButton != null) continueButton.OnClick -= OnContinueClicked;
            if (settingsButton != null) settingsButton.OnClick -= OnSettingsClicked;
            if (quitButton != null) quitButton.OnClick -= OnQuitClicked;
        }
    }
}

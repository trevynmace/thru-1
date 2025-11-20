using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Main game view that manages sub-views (Play, Map, Inventory, etc.)
    /// Replaces MonoGame's GameView and GameViewStateMachine.
    /// </summary>
    public class GameView : MonoBehaviour, IView
    {
        [Header("Current State")]
        [SerializeField] private PlayState _currentPlayState = PlayState.Play;

        [Header("Sub-View References")]
        public GameObject playView;
        public GameObject mapView;
        public GameObject inventoryView;
        public GameObject encounterView;
        public GameObject dialogueView;
        public GameObject pauseView;
        public GameObject settingsView;

        private GameStateManager _stateManager;

        // Sub-view components
        private IGameView _playViewComponent;
        private IGameView _mapViewComponent;
        private IGameView _inventoryViewComponent;
        private IGameView _encounterViewComponent;
        private IGameView _dialogueViewComponent;
        private IGameView _pauseViewComponent;
        private IGameView _settingsViewComponent;

        public PlayState CurrentPlayState
        {
            get => _currentPlayState;
            set
            {
                if (_currentPlayState != value)
                {
                    _currentPlayState = value;
                    UpdateActiveSubView();
                }
            }
        }

        public void Initialize(GameStateManager stateManager)
        {
            _stateManager = stateManager;
            InitializeSubViews();
        }

        private void InitializeSubViews()
        {
            if (playView != null)
            {
                _playViewComponent = playView.GetComponent<IGameView>();
                _playViewComponent?.Initialize(_stateManager);
            }

            if (mapView != null)
            {
                _mapViewComponent = mapView.GetComponent<IGameView>();
                _mapViewComponent?.Initialize(_stateManager);
            }

            if (inventoryView != null)
            {
                _inventoryViewComponent = inventoryView.GetComponent<IGameView>();
                _inventoryViewComponent?.Initialize(_stateManager);
            }

            if (encounterView != null)
            {
                _encounterViewComponent = encounterView.GetComponent<IGameView>();
                _encounterViewComponent?.Initialize(_stateManager);
            }

            if (dialogueView != null)
            {
                _dialogueViewComponent = dialogueView.GetComponent<IGameView>();
                _dialogueViewComponent?.Initialize(_stateManager);
            }

            if (pauseView != null)
            {
                _pauseViewComponent = pauseView.GetComponent<IGameView>();
                _pauseViewComponent?.Initialize(_stateManager);
            }

            if (settingsView != null)
            {
                _settingsViewComponent = settingsView.GetComponent<IGameView>();
                _settingsViewComponent?.Initialize(_stateManager);
            }
        }

        public void Show()
        {
            gameObject.SetActive(true);
            UpdateActiveSubView();
        }

        public void Hide()
        {
            HideAllSubViews();
            gameObject.SetActive(false);
        }

        public GameState UpdateView()
        {
            // Handle input for view switching
            HandleInput();

            // Update current sub-view
            PlayState? newPlayState = null;

            switch (_currentPlayState)
            {
                case PlayState.Play:
                    newPlayState = _playViewComponent?.UpdateView();
                    break;
                case PlayState.Map:
                    newPlayState = _mapViewComponent?.UpdateView();
                    break;
                case PlayState.Inventory:
                    newPlayState = _inventoryViewComponent?.UpdateView();
                    break;
                case PlayState.Encounter:
                    newPlayState = _encounterViewComponent?.UpdateView();
                    break;
                case PlayState.Dialogue:
                    newPlayState = _dialogueViewComponent?.UpdateView();
                    break;
                case PlayState.Pause:
                    newPlayState = _pauseViewComponent?.UpdateView();
                    break;
                case PlayState.Settings:
                    newPlayState = _settingsViewComponent?.UpdateView();
                    break;
            }

            if (newPlayState.HasValue && newPlayState.Value != _currentPlayState)
            {
                CurrentPlayState = newPlayState.Value;
            }

            return GameState.Game;
        }

        private void HandleInput()
        {
            // Toggle map with M
            if (Input.GetKeyDown(KeyCode.M))
            {
                CurrentPlayState = _currentPlayState == PlayState.Map ? PlayState.Play : PlayState.Map;
            }

            // Toggle inventory with I or Tab
            if (Input.GetKeyDown(KeyCode.I) || Input.GetKeyDown(KeyCode.Tab))
            {
                CurrentPlayState = _currentPlayState == PlayState.Inventory ? PlayState.Play : PlayState.Inventory;
            }

            // Pause with Escape (if not in menu)
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                if (_currentPlayState == PlayState.Pause)
                    CurrentPlayState = PlayState.Play;
                else if (_currentPlayState != PlayState.Encounter && _currentPlayState != PlayState.Dialogue)
                    CurrentPlayState = PlayState.Pause;
            }
        }

        private void UpdateActiveSubView()
        {
            HideAllSubViews();

            switch (_currentPlayState)
            {
                case PlayState.Play:
                    _playViewComponent?.Show();
                    break;
                case PlayState.Map:
                    _mapViewComponent?.Show();
                    break;
                case PlayState.Inventory:
                    _inventoryViewComponent?.Show();
                    break;
                case PlayState.Encounter:
                    _encounterViewComponent?.Show();
                    break;
                case PlayState.Dialogue:
                    _dialogueViewComponent?.Show();
                    break;
                case PlayState.Pause:
                    _pauseViewComponent?.Show();
                    break;
                case PlayState.Settings:
                    _settingsViewComponent?.Show();
                    break;
            }
        }

        private void HideAllSubViews()
        {
            _playViewComponent?.Hide();
            _mapViewComponent?.Hide();
            _inventoryViewComponent?.Hide();
            _encounterViewComponent?.Hide();
            _dialogueViewComponent?.Hide();
            _pauseViewComponent?.Hide();
            _settingsViewComponent?.Hide();
        }

        #region State Change Methods

        public void GoToPlay() => CurrentPlayState = PlayState.Play;
        public void GoToMap() => CurrentPlayState = PlayState.Map;
        public void GoToInventory() => CurrentPlayState = PlayState.Inventory;
        public void GoToPause() => CurrentPlayState = PlayState.Pause;
        public void GoToSettings() => CurrentPlayState = PlayState.Settings;

        public void TriggerEncounter()
        {
            CurrentPlayState = PlayState.Encounter;
        }

        public void TriggerDialogue()
        {
            CurrentPlayState = PlayState.Dialogue;
        }

        #endregion
    }
}

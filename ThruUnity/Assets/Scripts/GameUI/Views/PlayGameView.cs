using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Main gameplay view - character walking, world interaction.
    /// Replaces MonoGame's PlayGameView.
    /// </summary>
    public class PlayGameView : MonoBehaviour, IGameView
    {
        [Header("References")]
        public CharacterModel playerModel;
        public Transform worldContainer;

        [Header("HUD")]
        public GameObject hudObject;

        private GameStateManager _stateManager;
        private CanvasGroup _canvasGroup;

        private void Awake()
        {
            _canvasGroup = GetComponent<CanvasGroup>();
        }

        public void Initialize(GameStateManager stateManager)
        {
            _stateManager = stateManager;

            // Set up player model if not assigned
            if (playerModel == null && _stateManager.Player != null)
            {
                // Find or create player model
                var modelObj = _stateManager.Player.CharacterModel;
                if (modelObj != null)
                {
                    playerModel = modelObj.GetComponent<CharacterModel>();
                }
            }
        }

        public void Show()
        {
            gameObject.SetActive(true);
            if (_canvasGroup != null)
            {
                _canvasGroup.alpha = 1f;
                _canvasGroup.interactable = true;
            }

            if (hudObject != null)
                hudObject.SetActive(true);
        }

        public void Hide()
        {
            if (_canvasGroup != null)
            {
                _canvasGroup.alpha = 0f;
                _canvasGroup.interactable = false;
            }
            gameObject.SetActive(false);

            if (hudObject != null)
                hudObject.SetActive(false);
        }

        public PlayState UpdateView()
        {
            // Handle movement input
            HandleMovement();

            // Check for encounters, dialogue triggers, etc.
            // This would be expanded based on game logic

            return PlayState.Play;
        }

        private void HandleMovement()
        {
            if (_stateManager.Player == null) return;

            // Get input
            float horizontal = Input.GetAxis("Horizontal");
            float vertical = Input.GetAxis("Vertical");

            if (horizontal != 0 || vertical != 0)
            {
                // Move player
                Vector2 movement = new Vector2(horizontal, vertical).normalized;
                float speed = _stateManager.Player.Stats.Speed * 0.1f;

                _stateManager.Player.ScreenPosition += movement * speed * Time.deltaTime * 100f;

                // Update model position
                if (playerModel != null)
                {
                    playerModel.SetPosition(_stateManager.Player.ScreenPosition);
                }
            }
        }
    }
}

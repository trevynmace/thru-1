using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Animates a spritesheet by cycling through frames.
    /// Replaces MonoGame's AnimatedSprite class.
    ///
    /// Usage:
    /// 1. Attach to a GameObject with a SpriteRenderer
    /// 2. Assign a spritesheet texture
    /// 3. Set rows and columns to match your spritesheet layout
    /// </summary>
    [RequireComponent(typeof(SpriteRenderer))]
    public class SpriteAnimator : MonoBehaviour
    {
        [Header("Spritesheet Settings")]
        [Tooltip("The spritesheet texture containing all animation frames")]
        public Texture2D spritesheet;

        [Tooltip("Number of rows in the spritesheet")]
        public int rows = 1;

        [Tooltip("Number of columns in the spritesheet")]
        public int columns = 4;

        [Header("Animation Settings")]
        [Tooltip("Seconds per frame (0.5 = 500ms like original)")]
        public float secondsPerFrame = 0.5f;

        [Tooltip("Tint color for the sprite")]
        public Color color = Color.white;

        [Tooltip("Should the animation loop?")]
        public bool loop = true;

        [Tooltip("Should animation play automatically?")]
        public bool playOnStart = true;

        // Animation state
        public int CurrentFrame { get; private set; }
        public int TotalFrames { get; private set; }
        public bool IsPlaying { get; private set; }

        // Internal
        private SpriteRenderer _spriteRenderer;
        private Sprite[] _sprites;
        private float _timeSinceLastFrame;

        private void Awake()
        {
            _spriteRenderer = GetComponent<SpriteRenderer>();
        }

        private void Start()
        {
            if (spritesheet != null)
            {
                InitializeSprites();
            }

            if (playOnStart)
            {
                Play();
            }
        }

        private void Update()
        {
            if (!IsPlaying || _sprites == null || _sprites.Length == 0)
                return;

            _timeSinceLastFrame += Time.deltaTime;

            if (_timeSinceLastFrame >= secondsPerFrame)
            {
                _timeSinceLastFrame -= secondsPerFrame;
                CurrentFrame++;

                if (CurrentFrame >= TotalFrames)
                {
                    if (loop)
                    {
                        CurrentFrame = 0;
                    }
                    else
                    {
                        CurrentFrame = TotalFrames - 1;
                        IsPlaying = false;
                    }
                }

                UpdateSprite();
            }
        }

        /// <summary>
        /// Initialize sprites from the spritesheet texture
        /// </summary>
        public void InitializeSprites()
        {
            if (spritesheet == null)
            {
                Debug.LogWarning("SpriteAnimator: No spritesheet assigned");
                return;
            }

            TotalFrames = rows * columns;
            _sprites = new Sprite[TotalFrames];

            int frameWidth = spritesheet.width / columns;
            int frameHeight = spritesheet.height / rows;

            for (int i = 0; i < TotalFrames; i++)
            {
                int column = i % columns;
                int row = i / columns;

                // Note: Unity's texture coordinates are bottom-left origin
                // So we need to flip the Y coordinate
                int x = column * frameWidth;
                int y = (rows - 1 - row) * frameHeight; // Flip Y

                Rect rect = new Rect(x, y, frameWidth, frameHeight);
                Vector2 pivot = new Vector2(0.5f, 0.5f); // Center pivot

                _sprites[i] = Sprite.Create(
                    spritesheet,
                    rect,
                    pivot,
                    100f // Pixels per unit
                );
            }

            CurrentFrame = 0;
            UpdateSprite();
        }

        /// <summary>
        /// Set up with a new spritesheet (equivalent to MonoGame constructor)
        /// </summary>
        public void Setup(Texture2D texture, int rows, int columns, Color? tintColor = null)
        {
            this.spritesheet = texture;
            this.rows = rows;
            this.columns = columns;
            this.color = tintColor ?? Color.white;

            InitializeSprites();
        }

        private void UpdateSprite()
        {
            if (_sprites != null && CurrentFrame < _sprites.Length)
            {
                _spriteRenderer.sprite = _sprites[CurrentFrame];
                _spriteRenderer.color = color;
            }
        }

        #region Playback Control

        public void Play()
        {
            IsPlaying = true;
        }

        public void Pause()
        {
            IsPlaying = false;
        }

        public void Stop()
        {
            IsPlaying = false;
            CurrentFrame = 0;
            _timeSinceLastFrame = 0f;
            UpdateSprite();
        }

        public void SetFrame(int frame)
        {
            CurrentFrame = Mathf.Clamp(frame, 0, TotalFrames - 1);
            UpdateSprite();
        }

        #endregion

        /// <summary>
        /// Alternative: Use pre-sliced sprites from Unity's sprite editor
        /// </summary>
        public void SetSprites(Sprite[] sprites)
        {
            _sprites = sprites;
            TotalFrames = sprites.Length;
            CurrentFrame = 0;
            UpdateSprite();
        }
    }

    /// <summary>
    /// Interface for animated objects (mirrors MonoGame's IAnimated)
    /// </summary>
    public interface IAnimated
    {
        int CurrentFrame { get; }
        int TotalFrames { get; }
        bool IsPlaying { get; }

        void Play();
        void Pause();
        void Stop();
    }
}

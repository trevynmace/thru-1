using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Individual sprite layer for CharacterModel.
    /// Syncs animation frame with parent CharacterModel.
    /// Replaces MonoGame's CharacterModelSprite.
    /// </summary>
    [RequireComponent(typeof(SpriteRenderer))]
    public class CharacterModelSprite : MonoBehaviour
    {
        [Header("Settings")]
        public Color tintColor = Color.white;

        // Reference to parent model for shared animation state
        public CharacterModel ParentModel { get; private set; }

        // Internal
        private SpriteRenderer _spriteRenderer;
        private Texture2D _texture;
        private Sprite[] _sprites;
        private int _currentFrame;

        private void Awake()
        {
            _spriteRenderer = GetComponent<SpriteRenderer>();
        }

        /// <summary>
        /// Initialize the sprite layer
        /// </summary>
        public void Initialize(CharacterModel parent, Texture2D texture, int sortingOrder, Color? color = null)
        {
            ParentModel = parent;
            tintColor = color ?? Color.white;

            // Set up renderer
            _spriteRenderer.sortingOrder = sortingOrder;
            _spriteRenderer.color = tintColor;

            // Set texture if provided
            if (texture != null)
            {
                SetTexture(texture);
            }
        }

        /// <summary>
        /// Set the spritesheet texture and slice it into frames
        /// </summary>
        public void SetTexture(Texture2D texture)
        {
            if (texture == null)
            {
                ClearTexture();
                return;
            }

            _texture = texture;

            // Get animation settings from parent
            int rows = ParentModel != null ? ParentModel.rows : 1;
            int columns = ParentModel != null ? ParentModel.columns : 4;
            int totalFrames = rows * columns;

            // Create sprites from texture
            _sprites = new Sprite[totalFrames];

            int frameWidth = texture.width / columns;
            int frameHeight = texture.height / rows;

            for (int i = 0; i < totalFrames; i++)
            {
                int column = i % columns;
                int row = i / columns;

                // Unity's texture origin is bottom-left, so flip Y
                int x = column * frameWidth;
                int y = (rows - 1 - row) * frameHeight;

                Rect rect = new Rect(x, y, frameWidth, frameHeight);
                Vector2 pivot = new Vector2(0.5f, 0.5f);

                _sprites[i] = Sprite.Create(
                    texture,
                    rect,
                    pivot,
                    100f // Pixels per unit
                );
            }

            // Show first frame
            SetFrame(0);
        }

        /// <summary>
        /// Clear the texture (make invisible)
        /// </summary>
        public void ClearTexture()
        {
            _texture = null;
            _sprites = null;
            _spriteRenderer.sprite = null;
        }

        /// <summary>
        /// Set the current animation frame
        /// </summary>
        public void SetFrame(int frame)
        {
            _currentFrame = frame;

            if (_sprites != null && frame >= 0 && frame < _sprites.Length)
            {
                _spriteRenderer.sprite = _sprites[frame];
            }
        }

        /// <summary>
        /// Set the tint color
        /// </summary>
        public void SetColor(Color color)
        {
            tintColor = color;
            _spriteRenderer.color = color;
        }

        /// <summary>
        /// Show/hide this layer
        /// </summary>
        public void SetVisible(bool visible)
        {
            _spriteRenderer.enabled = visible;
        }

        /// <summary>
        /// Check if this layer has a texture assigned
        /// </summary>
        public bool HasTexture => _texture != null;

        /// <summary>
        /// Get the current sprite bounds
        /// </summary>
        public Bounds GetBounds()
        {
            return _spriteRenderer.bounds;
        }
    }
}

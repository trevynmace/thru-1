using UnityEngine;
using System.Collections.Generic;
using TMPro;

namespace Thru
{
    /// <summary>
    /// Composite character model with layered animated sprites.
    /// Replaces MonoGame's CharacterModel.
    ///
    /// Structure: Parent GameObject with child SpriteRenderers for each layer.
    /// All layers share the same animation frame (synchronized).
    /// </summary>
    public class CharacterModel : MonoBehaviour
    {
        [Header("Character Reference")]
        public Character CharacterData;

        [Header("Animation Settings")]
        public int rows = 1;
        public int columns = 4;
        public float secondsPerFrame = 0.5f;

        [Header("Scale")]
        public float modelScale = 1f;

        [Header("Name Display")]
        public TextMeshPro nameText;
        public Color nameColor = Color.red;

        [Header("Body Part Sprites (auto-created if null)")]
        public CharacterModelSprite bodySprite;
        public CharacterModelSprite hairSprite;
        public CharacterModelSprite eyesSprite;
        public CharacterModelSprite armsSprite;

        [Header("Equipment Slots")]
        public CharacterModelSprite backpackSprite;
        public CharacterModelSprite backpackStrapsSprite;
        public CharacterModelSprite shirtSprite;
        public CharacterModelSprite sleevesSprite;
        public CharacterModelSprite pantsSprite;
        public CharacterModelSprite shoesSprite;
        public CharacterModelSprite hatSprite;
        public CharacterModelSprite polesSprite;

        [Header("Sprite Assets (assign in Inspector or load at runtime)")]
        public Texture2D bodyTexture;
        public Texture2D hairTexture;
        public Texture2D eyesTexture;
        public Texture2D armsTexture;

        // Animation state (shared by all sprites)
        public int CurrentFrame { get; private set; }
        public int TotalFrames { get; private set; }

        // Equipment sprite dictionary
        private Dictionary<ItemSlot, CharacterModelSprite> _equippedSprites;

        // Internal
        private float _timeSinceLastFrame;

        private void Awake()
        {
            TotalFrames = rows * columns;
            InitializeEquipmentDictionary();
        }

        /// <summary>
        /// Initialize with character data
        /// </summary>
        public void Initialize(Character character)
        {
            CharacterData = character;

            // Set up name display
            if (nameText != null)
            {
                nameText.text = character.Name;
                nameText.color = nameColor;
            }

            // Load default textures if not assigned
            LoadDefaultTextures();

            // Create sprite layers
            CreateSpriteLayers();
        }

        private void InitializeEquipmentDictionary()
        {
            _equippedSprites = new Dictionary<ItemSlot, CharacterModelSprite>
            {
                { ItemSlot.BackpackStraps, null },
                { ItemSlot.Backpack, null },
                { ItemSlot.Hat, null },
                { ItemSlot.Shirt, null },
                { ItemSlot.Sleeves, null },
                { ItemSlot.Pants, null },
                { ItemSlot.Shoes, null },
                { ItemSlot.Poles, null },
                { ItemSlot.Misc1, null },
                { ItemSlot.Misc2, null },
            };
        }

        private void LoadDefaultTextures()
        {
            // Load from Resources if not assigned
            if (bodyTexture == null)
                bodyTexture = Resources.Load<Texture2D>("CharacterModels/CharacterAnimation-body-Sheet");
            if (hairTexture == null)
                hairTexture = Resources.Load<Texture2D>("CharacterModels/CharacterAnimation-Hair-Sheet");
            if (eyesTexture == null)
                eyesTexture = Resources.Load<Texture2D>("CharacterModels/CharacterAnimation-eyes-Sheet");
            if (armsTexture == null)
                armsTexture = Resources.Load<Texture2D>("CharacterModels/CharacterAnimation-arms-Sheet");
        }

        private void CreateSpriteLayers()
        {
            // Create layers in drawing order (back to front)
            // Sorting order determines which appears on top

            int sortOrder = 0;

            // Back layer - backpack (behind body)
            if (backpackSprite == null)
                backpackSprite = CreateSpriteLayer("Backpack", null, sortOrder++);

            // Body
            if (bodySprite == null)
                bodySprite = CreateSpriteLayer("Body", bodyTexture, sortOrder++);

            // Hair
            if (hairSprite == null)
                hairSprite = CreateSpriteLayer("Hair", hairTexture, sortOrder++);

            // Eyes
            if (eyesSprite == null)
                eyesSprite = CreateSpriteLayer("Eyes", eyesTexture, sortOrder++);

            // Shirt
            if (shirtSprite == null)
                shirtSprite = CreateSpriteLayer("Shirt", null, sortOrder++);

            // Arms
            if (armsSprite == null)
                armsSprite = CreateSpriteLayer("Arms", armsTexture, sortOrder++);

            // Sleeves
            if (sleevesSprite == null)
                sleevesSprite = CreateSpriteLayer("Sleeves", null, sortOrder++);

            // Backpack straps (over shirt)
            if (backpackStrapsSprite == null)
                backpackStrapsSprite = CreateSpriteLayer("BackpackStraps", null, sortOrder++);

            // Pants
            if (pantsSprite == null)
                pantsSprite = CreateSpriteLayer("Pants", null, sortOrder++);

            // Shoes
            if (shoesSprite == null)
                shoesSprite = CreateSpriteLayer("Shoes", null, sortOrder++);

            // Update equipment references
            _equippedSprites[ItemSlot.Backpack] = backpackSprite;
            _equippedSprites[ItemSlot.BackpackStraps] = backpackStrapsSprite;
            _equippedSprites[ItemSlot.Shirt] = shirtSprite;
            _equippedSprites[ItemSlot.Sleeves] = sleevesSprite;
            _equippedSprites[ItemSlot.Pants] = pantsSprite;
            _equippedSprites[ItemSlot.Shoes] = shoesSprite;
            _equippedSprites[ItemSlot.Hat] = hatSprite;
            _equippedSprites[ItemSlot.Poles] = polesSprite;
        }

        private CharacterModelSprite CreateSpriteLayer(string layerName, Texture2D texture, int sortingOrder)
        {
            GameObject layerObj = new GameObject(layerName);
            layerObj.transform.SetParent(transform, false);

            var sprite = layerObj.AddComponent<CharacterModelSprite>();
            sprite.Initialize(this, texture, sortingOrder);

            return sprite;
        }

        private void Update()
        {
            UpdateAnimation();
        }

        private void UpdateAnimation()
        {
            _timeSinceLastFrame += Time.deltaTime;

            if (_timeSinceLastFrame >= secondsPerFrame)
            {
                _timeSinceLastFrame -= secondsPerFrame;
                CurrentFrame++;

                if (CurrentFrame >= TotalFrames)
                {
                    CurrentFrame = 0;
                }

                // Update all sprite layers to new frame
                UpdateAllSprites();
            }
        }

        private void UpdateAllSprites()
        {
            // Update base sprites
            bodySprite?.SetFrame(CurrentFrame);
            hairSprite?.SetFrame(CurrentFrame);
            eyesSprite?.SetFrame(CurrentFrame);
            armsSprite?.SetFrame(CurrentFrame);

            // Update equipment sprites
            backpackSprite?.SetFrame(CurrentFrame);
            backpackStrapsSprite?.SetFrame(CurrentFrame);
            shirtSprite?.SetFrame(CurrentFrame);
            sleevesSprite?.SetFrame(CurrentFrame);
            pantsSprite?.SetFrame(CurrentFrame);
            shoesSprite?.SetFrame(CurrentFrame);
            hatSprite?.SetFrame(CurrentFrame);
            polesSprite?.SetFrame(CurrentFrame);
        }

        /// <summary>
        /// Equip an item, updating the appropriate sprite layer
        /// </summary>
        public void EquipItem(Item item)
        {
            if (item == null || item.Slot == ItemSlot.None)
                return;

            if (_equippedSprites.TryGetValue(item.Slot, out CharacterModelSprite sprite))
            {
                if (sprite != null)
                {
                    // TODO: Get texture from item
                    // sprite.SetTexture(item.EquippedTexture);
                    Debug.Log($"Equipped {item.Name} to {item.Slot}");
                }
            }
        }

        /// <summary>
        /// Unequip an item from a slot
        /// </summary>
        public void UnequipSlot(ItemSlot slot)
        {
            if (_equippedSprites.TryGetValue(slot, out CharacterModelSprite sprite))
            {
                if (sprite != null)
                {
                    sprite.ClearTexture();
                }
            }
        }

        /// <summary>
        /// Set the model's position
        /// </summary>
        public void SetPosition(Vector2 position)
        {
            transform.position = new Vector3(position.x, position.y, transform.position.z);

            if (CharacterData != null)
            {
                CharacterData.ScreenPosition = position;
            }
        }

        /// <summary>
        /// Set the model's scale
        /// </summary>
        public void SetScale(float scale)
        {
            modelScale = scale;
            transform.localScale = Vector3.one * scale;
        }
    }
}

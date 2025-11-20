using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using TMPro;

namespace Thru
{
    /// <summary>
    /// Grid-based inventory board where items can be placed.
    /// Replaces MonoGame's InventoryGameBoard receivers.
    /// </summary>
    public class GridInventory : MonoBehaviour
    {
        [Header("Grid Settings")]
        public int rows = 5;
        public int columns = 8;
        public int cellSize = 50;
        public int cellSpacing = 2;

        [Header("Visual")]
        public Color emptyColor = Color.black;
        public Color hoverColor = Color.red;
        public Color occupiedColor = new Color(0.5f, 0, 0);

        [Header("References")]
        public RectTransform gridContainer;

        // Grid state
        public int[,] Board { get; private set; }
        public InventorySlot[,] Slots { get; private set; }

        private void Awake()
        {
            if (gridContainer == null)
                gridContainer = GetComponent<RectTransform>();
        }

        private void Start()
        {
            InitializeGrid();
        }

        /// <summary>
        /// Create the grid of inventory slots
        /// </summary>
        public void InitializeGrid()
        {
            Board = new int[rows, columns];
            Slots = new InventorySlot[rows, columns];

            // Calculate total size
            float totalWidth = columns * (cellSize + cellSpacing) - cellSpacing;
            float totalHeight = rows * (cellSize + cellSpacing) - cellSpacing;

            gridContainer.sizeDelta = new Vector2(totalWidth, totalHeight);

            // Create slots
            for (int row = 0; row < rows; row++)
            {
                for (int col = 0; col < columns; col++)
                {
                    CreateSlot(row, col);
                }
            }
        }

        private void CreateSlot(int row, int col)
        {
            GameObject slotObj = new GameObject($"Slot_{row}_{col}");
            slotObj.transform.SetParent(gridContainer, false);

            // Position
            var rectTransform = slotObj.AddComponent<RectTransform>();
            rectTransform.sizeDelta = new Vector2(cellSize, cellSize);
            rectTransform.anchorMin = new Vector2(0, 1);
            rectTransform.anchorMax = new Vector2(0, 1);
            rectTransform.pivot = new Vector2(0, 1);
            rectTransform.anchoredPosition = new Vector2(
                col * (cellSize + cellSpacing),
                -row * (cellSize + cellSpacing)
            );

            // Visual
            var image = slotObj.AddComponent<Image>();
            image.color = emptyColor;

            // Slot component
            var slot = slotObj.AddComponent<InventorySlot>();
            slot.Initialize(this, new Vector2Int(row, col), emptyColor, hoverColor, occupiedColor);

            Slots[row, col] = slot;
        }

        /// <summary>
        /// Try to place an item group on the board
        /// </summary>
        public bool TryPlaceItem(ItemDraggableGroup group, Vector2Int position)
        {
            if (!group.CanFitAt(Board, position))
                return false;

            // Mark board cells as occupied
            int[,] shape = group.ItemShape;
            for (int i = 0; i < shape.GetLength(0); i++)
            {
                for (int j = 0; j < shape.GetLength(1); j++)
                {
                    if (shape[i, j] == 1)
                    {
                        int boardX = position.x + i;
                        int boardY = position.y + j;
                        Board[boardX, boardY] = 1;
                        Slots[boardX, boardY].SetOccupied(group.Item);
                    }
                }
            }

            group.PlaceOnBoard(position);
            return true;
        }

        /// <summary>
        /// Remove an item from the board
        /// </summary>
        public void RemoveItem(ItemDraggableGroup group)
        {
            // Clear board cells
            for (int i = 0; i < rows; i++)
            {
                for (int j = 0; j < columns; j++)
                {
                    if (Slots[i, j].HeldItem == group.Item)
                    {
                        Board[i, j] = 0;
                        Slots[i, j].SetEmpty();
                    }
                }
            }
        }

        /// <summary>
        /// Get world position for a board coordinate
        /// </summary>
        public Vector2 GetSlotPosition(Vector2Int boardPos)
        {
            return new Vector2(
                boardPos.y * (cellSize + cellSpacing),
                -boardPos.x * (cellSize + cellSpacing)
            );
        }

        /// <summary>
        /// Get board coordinate from world position
        /// </summary>
        public Vector2Int GetBoardPosition(Vector2 worldPos)
        {
            int col = Mathf.FloorToInt(worldPos.x / (cellSize + cellSpacing));
            int row = Mathf.FloorToInt(-worldPos.y / (cellSize + cellSpacing));

            return new Vector2Int(
                Mathf.Clamp(row, 0, rows - 1),
                Mathf.Clamp(col, 0, columns - 1)
            );
        }
    }

    /// <summary>
    /// Individual slot in the grid inventory
    /// </summary>
    public class InventorySlot : MonoBehaviour, IDropHandler, IPointerEnterHandler, IPointerExitHandler, IDropZone
    {
        public GridInventory Grid { get; private set; }
        public Vector2Int BoardPosition { get; private set; }
        public Item HeldItem { get; private set; }
        public bool IsOccupied => HeldItem != null;

        private Image _image;
        private Color _emptyColor;
        private Color _hoverColor;
        private Color _occupiedColor;

        public InventoryState DropZoneType => InventoryState.InventoryBoard;
        public Transform Transform => transform;

        public void Initialize(GridInventory grid, Vector2Int pos, Color empty, Color hover, Color occupied)
        {
            Grid = grid;
            BoardPosition = pos;
            _emptyColor = empty;
            _hoverColor = hover;
            _occupiedColor = occupied;
            _image = GetComponent<Image>();
            UpdateVisual();
        }

        public void OnDrop(PointerEventData eventData)
        {
            var draggable = eventData.pointerDrag?.GetComponent<DraggableItem>();
            if (draggable == null || draggable.Group == null) return;

            // Calculate placement position accounting for cell's position in shape
            Vector2Int placementPos = BoardPosition - draggable.ShapePosition;

            if (Grid.TryPlaceItem(draggable.Group, placementPos))
            {
                // Success - item placed
                foreach (var cell in draggable.Group.Draggables)
                {
                    if (cell != null)
                    {
                        cell.MoveToDropZone(this);
                    }
                }
            }
        }

        public void OnPointerEnter(PointerEventData eventData)
        {
            if (!IsOccupied)
                _image.color = _hoverColor;
        }

        public void OnPointerExit(PointerEventData eventData)
        {
            UpdateVisual();
        }

        public void SetOccupied(Item item)
        {
            HeldItem = item;
            UpdateVisual();
        }

        public void SetEmpty()
        {
            HeldItem = null;
            UpdateVisual();
        }

        private void UpdateVisual()
        {
            _image.color = IsOccupied ? _occupiedColor : _emptyColor;
        }

        public bool CanAcceptItem(DraggableItem item)
        {
            return !IsOccupied;
        }

        public void OnItemDropped(DraggableItem item)
        {
            HeldItem = item.Item;
            UpdateVisual();
        }

        public void OnItemRemoved(DraggableItem item)
        {
            HeldItem = null;
            UpdateVisual();
        }

        public Vector2 GetDropPosition(DraggableItem item)
        {
            return Grid.GetSlotPosition(BoardPosition);
        }
    }
}

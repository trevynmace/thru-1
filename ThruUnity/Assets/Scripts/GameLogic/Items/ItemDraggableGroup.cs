using UnityEngine;
using System.Collections.Generic;

namespace Thru
{
    /// <summary>
    /// Group of draggable cells that make up a single item.
    /// Handles items with shapes (like Tetris pieces).
    /// Replaces MonoGame's ItemIconDraggableGroup.
    /// </summary>
    public class ItemDraggableGroup : MonoBehaviour
    {
        [Header("Item Reference")]
        public Item Item;

        [Header("Shape")]
        public int[,] ItemShape;
        public int gridMargin = 50;

        [Header("Position")]
        public Vector2 HomePosition;
        public Vector2Int BoardPosition;

        // All draggable cells in this group
        public DraggableItem[,] Draggables { get; private set; }

        // State
        public GroupState CurrentState { get; private set; } = GroupState.AtHome;

        // The primary cell (first non-null draggable)
        public DraggableItem PrimaryDraggable
        {
            get
            {
                if (Draggables == null) return null;
                foreach (var drag in Draggables)
                {
                    if (drag != null) return drag;
                }
                return null;
            }
        }

        public enum GroupState
        {
            AtHome,
            BeingDragged,
            OnBoard,
            Equipped
        }

        /// <summary>
        /// Initialize the group with an item and shape
        /// </summary>
        public void Initialize(Item item, int[,] shape, Vector2 homePos, Sprite icon)
        {
            Item = item;
            ItemShape = shape;
            HomePosition = homePos;

            int rows = shape.GetLength(0);
            int cols = shape.GetLength(1);
            Draggables = new DraggableItem[rows, cols];

            // Create draggable cells for each filled position in shape
            for (int i = 0; i < rows; i++)
            {
                for (int j = 0; j < cols; j++)
                {
                    if (shape[i, j] == 1)
                    {
                        CreateDraggableCell(i, j, icon);
                    }
                }
            }

            UpdatePositions();
        }

        private void CreateDraggableCell(int row, int col, Sprite icon)
        {
            // Create UI element for this cell
            GameObject cellObj = new GameObject($"Cell_{row}_{col}");
            cellObj.transform.SetParent(transform, false);

            // Add required components
            var rectTransform = cellObj.AddComponent<RectTransform>();
            rectTransform.sizeDelta = new Vector2(gridMargin, gridMargin);

            var image = cellObj.AddComponent<UnityEngine.UI.Image>();
            image.sprite = icon;

            cellObj.AddComponent<CanvasGroup>();

            var draggable = cellObj.AddComponent<DraggableItem>();
            draggable.Initialize(Item, this, new Vector2Int(row, col), icon);

            Draggables[row, col] = draggable;
        }

        /// <summary>
        /// Called when any cell starts being dragged
        /// </summary>
        public void OnBeginDrag(DraggableItem cell)
        {
            CurrentState = GroupState.BeingDragged;

            // Bring all cells to front
            foreach (var drag in Draggables)
            {
                if (drag != null && drag != cell)
                {
                    drag.transform.SetAsLastSibling();
                }
            }
        }

        /// <summary>
        /// Called during drag
        /// </summary>
        public void OnDrag(DraggableItem cell, Vector2 delta)
        {
            // Move all other cells with the dragged one
            foreach (var drag in Draggables)
            {
                if (drag != null && drag != cell)
                {
                    drag.GetComponent<RectTransform>().anchoredPosition += delta;
                }
            }
        }

        /// <summary>
        /// Called when drag ends
        /// </summary>
        public void OnEndDrag(DraggableItem cell)
        {
            // State will be updated by drop zone
        }

        /// <summary>
        /// Rotate the item shape 90 degrees clockwise
        /// </summary>
        public void Rotate()
        {
            if (ItemShape == null) return;

            int rows = ItemShape.GetLength(0);
            int cols = ItemShape.GetLength(1);

            // Create rotated shape
            int[,] rotated = new int[cols, rows];
            DraggableItem[,] rotatedDraggables = new DraggableItem[cols, rows];

            for (int i = 0; i < rows; i++)
            {
                for (int j = 0; j < cols; j++)
                {
                    rotated[j, rows - 1 - i] = ItemShape[i, j];
                    if (Draggables[i, j] != null)
                    {
                        rotatedDraggables[j, rows - 1 - i] = Draggables[i, j];
                        Draggables[i, j].ShapePosition = new Vector2Int(j, rows - 1 - i);
                    }
                }
            }

            ItemShape = rotated;
            Draggables = rotatedDraggables;

            UpdatePositions();
        }

        /// <summary>
        /// Update all cell positions based on current state
        /// </summary>
        public void UpdatePositions()
        {
            if (Draggables == null) return;

            Vector2 basePos = GetBasePosition();

            for (int i = 0; i < Draggables.GetLength(0); i++)
            {
                for (int j = 0; j < Draggables.GetLength(1); j++)
                {
                    if (Draggables[i, j] != null)
                    {
                        var rect = Draggables[i, j].GetComponent<RectTransform>();
                        rect.anchoredPosition = basePos + new Vector2(i * gridMargin, -j * gridMargin);
                    }
                }
            }
        }

        private Vector2 GetBasePosition()
        {
            switch (CurrentState)
            {
                case GroupState.OnBoard:
                    return new Vector2(BoardPosition.x * gridMargin, -BoardPosition.y * gridMargin);
                case GroupState.Equipped:
                    return PrimaryDraggable?.CurrentDropZone?.GetDropPosition(PrimaryDraggable) ?? HomePosition;
                default:
                    return HomePosition;
            }
        }

        /// <summary>
        /// Place the group on the inventory board
        /// </summary>
        public void PlaceOnBoard(Vector2Int boardPos)
        {
            BoardPosition = boardPos;
            CurrentState = GroupState.OnBoard;
            UpdatePositions();
        }

        /// <summary>
        /// Return to home position
        /// </summary>
        public void ReturnHome()
        {
            CurrentState = GroupState.AtHome;
            UpdatePositions();
        }

        /// <summary>
        /// Equip to an equipment slot
        /// </summary>
        public void Equip(IDropZone slot)
        {
            CurrentState = GroupState.Equipped;
            UpdatePositions();
        }

        /// <summary>
        /// Check if shape fits at board position
        /// </summary>
        public bool CanFitAt(int[,] board, Vector2Int position)
        {
            int shapeRows = ItemShape.GetLength(0);
            int shapeCols = ItemShape.GetLength(1);
            int boardRows = board.GetLength(0);
            int boardCols = board.GetLength(1);

            for (int i = 0; i < shapeRows; i++)
            {
                for (int j = 0; j < shapeCols; j++)
                {
                    if (ItemShape[i, j] == 1)
                    {
                        int boardX = position.x + i;
                        int boardY = position.y + j;

                        // Check bounds
                        if (boardX < 0 || boardX >= boardRows || boardY < 0 || boardY >= boardCols)
                            return false;

                        // Check collision
                        if (board[boardX, boardY] == 1)
                            return false;
                    }
                }
            }

            return true;
        }
    }
}

using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Utility functions for the game.
    /// Replaces MonoGame's ThruLib.
    /// </summary>
    public static class ThruUtils
    {
        /// <summary>
        /// Check if a point is within a texture's non-transparent pixels.
        /// Unity version using Texture2D pixel reading.
        ///
        /// Note: In Unity UI, you typically use Image.alphaHitTestMinimumThreshold
        /// instead for click detection on UI Images.
        /// </summary>
        public static bool HitImageAlpha(Rect bounds, Texture2D texture, int x, int y)
        {
            // Check if point is within bounds first
            if (!bounds.Contains(new Vector2(x, y)))
                return false;

            // Calculate texture coordinates
            int texX = (int)((x - bounds.x) * (texture.width / bounds.width));
            int texY = (int)((y - bounds.y) * (texture.height / bounds.height));

            // Clamp to texture bounds
            texX = Mathf.Clamp(texX, 0, texture.width - 1);
            texY = Mathf.Clamp(texY, 0, texture.height - 1);

            // Get pixel and check alpha
            // Note: Texture must be Read/Write enabled in import settings
            try
            {
                Color pixel = texture.GetPixel(texX, texY);
                return pixel.a > 0.08f; // ~20/255 threshold like MonoGame version
            }
            catch
            {
                // If texture is not readable, fall back to bounds check
                return true;
            }
        }

        /// <summary>
        /// Check if mouse is within a rect (screen coordinates)
        /// </summary>
        public static bool IsMouseInRect(Rect rect)
        {
            Vector2 mousePos = Input.mousePosition;
            return rect.Contains(mousePos);
        }

        /// <summary>
        /// Convert world position to screen position
        /// </summary>
        public static Vector2 WorldToScreen(Vector3 worldPos)
        {
            if (Camera.main != null)
            {
                return Camera.main.WorldToScreenPoint(worldPos);
            }
            return Vector2.zero;
        }

        /// <summary>
        /// Convert screen position to world position
        /// </summary>
        public static Vector3 ScreenToWorld(Vector2 screenPos, float depth = 0f)
        {
            if (Camera.main != null)
            {
                Vector3 pos = new Vector3(screenPos.x, screenPos.y, depth);
                return Camera.main.ScreenToWorldPoint(pos);
            }
            return Vector3.zero;
        }

        /// <summary>
        /// Lerp color with alpha
        /// </summary>
        public static Color LerpColor(Color a, Color b, float t)
        {
            return Color.Lerp(a, b, t);
        }

        /// <summary>
        /// Check if two rects overlap
        /// </summary>
        public static bool RectsOverlap(Rect a, Rect b)
        {
            return a.Overlaps(b);
        }

        /// <summary>
        /// Clamp a Vector2 within bounds
        /// </summary>
        public static Vector2 ClampVector2(Vector2 value, Vector2 min, Vector2 max)
        {
            return new Vector2(
                Mathf.Clamp(value.x, min.x, max.x),
                Mathf.Clamp(value.y, min.y, max.y)
            );
        }

        /// <summary>
        /// Distance between two points
        /// </summary>
        public static float Distance(Vector2 a, Vector2 b)
        {
            return Vector2.Distance(a, b);
        }
    }
}

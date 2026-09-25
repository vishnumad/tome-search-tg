export interface Series {
  name: string;
  /** Display position within the series, e.g. "1", "2.5" or "1-12" for omnibuses. */
  position?: string;
  /** Number of main (non-companion) books in the series. */
  total?: number;
}

export interface Book {
  id: number;
  title: string;
  url: string;
  authors: string[];
  series?: Series;
  description?: string;
  /** Average rating out of 5. */
  rating?: number;
  ratingsCount: number;
  releaseYear?: number;
  coverUrl?: string;
  /** Most relevant first. */
  genres: string[];
}

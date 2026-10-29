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
  pages?: number;
  coverUrl?: string;
  /** Most relevant first. */
  genres: string[];
}

/** One book in a series' reading order. */
export interface SeriesBook {
  title: string;
  url: string;
  /** Display position, e.g. "1" or "2.5". */
  position: string;
  releaseYear?: number;
  /** Average rating out of 5. */
  rating?: number;
  coverUrl?: string;
}

/** A series on its own, as returned by a series search. */
export interface SeriesDetails {
  id: number;
  name: string;
  url: string;
  author?: string;
  description?: string;
  /** Number of main (non-companion) books. */
  primaryBooksCount?: number;
  /** All books, including novellas and other companions. */
  booksCount: number;
  isCompleted?: boolean;
  /** Ordered by position. May be cut short for long series. */
  books: SeriesBook[];
  /** True when `books` was cut short. */
  hasMoreBooks: boolean;
}

# Foo

```groq
*[_type=='movie']{
  ...,
  releaseDate >= '2018-06-01' => {
    "screenings": *[_type == 'screening' && movie._ref == ^._id],
    "news": *[_type == 'news' && movie._ref == ^._id],
  },
  popularity > 20 && rating > 7.0 => {
    "featured": true,
    "awards": *[_type == 'award' && movie._ref == ^._id],
  },
}
```

import {defineQuery} from 'groq'
const groq = () => ''

const query = groq`*[_type=='movie']{
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
`

const query2 = /* groq */`
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
`

const query3 = `// groq
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
`

 const query4  = defineQuery(`*[_type=='movie']{
  ...,
  releaseDate >= '2018-06-01' => {
    "screenings": *[_type == 'screening' && movie._ref == ^._id],
    "news": *[_type == 'news' && movie._ref == ^._id],
  },
  popularity > 20 && rating > 7.0 => {
    "featured": true,
    "awards": *[_type == 'award' && movie._ref == ^._id],
  },
}`)

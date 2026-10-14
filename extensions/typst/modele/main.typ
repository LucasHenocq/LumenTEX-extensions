#set document(title: "{{titre}}", author: "{{auteur}}")
#set page(paper: "a4", margin: 2.5cm, numbering: "1")
#set text(lang: "fr", size: 11pt)
#set par(justify: true)
#set heading(numbering: "1.1")

#align(center)[
  #text(size: 20pt, weight: "bold")[{{titre}}]

  {{auteur}} — #datetime.today().display("[day]/[month]/[year]")
]

#outline()

= Introduction

Typst se compile en un instant. Écrivez du texte, en *gras* ou en _italique_, des listes :

- un premier point ;
- un second point.

= Mathématiques

Une formule dans le texte : $x^2 + y^2 = r^2$. Une formule centrée :

$ sum_(k=1)^n k = (n(n+1)) / 2 $

= Pour aller plus loin

Tapez `#` dans l'éditeur pour voir les fonctions proposées. Documentation : #link("https://typst.app/docs")[typst.app/docs].

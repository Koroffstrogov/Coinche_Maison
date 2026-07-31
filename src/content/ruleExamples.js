export const ruleExamples = {
  5: [
    {
      reference: '5.1',
      kind: 'Cas général',
      title: 'Monter ou changer de couleur',
      situation:
        'Le contrat en cours est de 90 à cœur. Un joueur souhaite annoncer 120 à pique.',
      application:
        'L’annonce est valable. En revanche, 90 à pique serait interdit, car le montant doit toujours augmenter.',
    },
    {
      reference: '5.2',
      kind: 'Cas limite',
      title: 'Revenir après avoir passé',
      situation:
        'Alice passe. Son partenaire annonce ensuite 90 à cœur. Lorsque la parole revient à Alice, elle annonce 110 à pique.',
      application:
        'L’annonce est valable : Alice surenchérit sur le contrat de son partenaire et peut en changer la couleur.',
    },
    {
      reference: '5.2',
      kind: 'Cas général',
      title: 'Trois passes consécutifs',
      situation:
        'Après une annonce, deux joueurs passent. Le troisième surenchérit, puis les trois autres joueurs passent.',
      application:
        'La surenchère remet le décompte à zéro. Les trois passes qui la suivent mettent fin aux enchères.',
    },
    {
      reference: '5.3',
      kind: 'Cas limite',
      title: 'Contrat forcé',
      situation:
        'Les quatre joueurs passent sans annoncer. Le premier joueur à avoir parlé choisit un capot à carreau.',
      application:
        'Ce contrat est immédiatement définitif. Aucune autre enchère n’est possible, mais l’équipe en défense peut coincher avant la première carte.',
    },
  ],
  6: [
    {
      reference: '6.1',
      kind: 'Cas général',
      title: 'Coinche hors tour',
      situation:
        'Un contrat de 100 à cœur est en cours. Un joueur de l’équipe en défense annonce « coinche » hors de son tour, avant la première carte.',
      application:
        'La coinche est valable. Le contrat devient définitif et les enchères s’arrêtent immédiatement.',
    },
    {
      reference: '6.1',
      kind: 'Cas limite',
      title: 'Deux annonces simultanées',
      situation:
        'Sur un contrat de 90 à cœur, un attaquant annonce 100 à pique au même instant qu’un défenseur annonce « coinche ».',
      application:
        'La coinche est prioritaire. Le contrat de 90 à cœur est coinché et l’annonce de 100 à pique ne prend pas effet.',
    },
    {
      reference: '6.2',
      kind: 'Cas général',
      title: 'Surcoinche différée',
      situation:
        'Un contrat de 100 à trèfle est coinché. Le partenaire du joueur ayant pris attend, puis surcoinche avant la première carte.',
      application:
        'La surcoinche est valable même si elle n’est pas immédiate. Elle est définitive et ne rouvre pas les enchères.',
    },
  ],
  7: [
    {
      reference: '7.1 et 7.3',
      kind: 'Cas général',
      title: 'Fournir malgré une coupe',
      situation:
        'Pique est demandé et cœur est l’atout. Un adversaire a déjà coupé avec le 7 de cœur. Le joueur possède encore l’as de pique.',
      application:
        'Le joueur doit fournir un pique. Il ne peut pas couper ni défausser tant qu’il possède la couleur demandée.',
    },
    {
      reference: '7.2',
      kind: 'Cas limite',
      title: 'Monter sur son partenaire',
      situation:
        'Cœur est demandé et constitue l’atout. Le partenaire est maître avec le 9 de cœur. Le joueur possède le valet et le 7 de cœur.',
      application:
        'Le joueur doit poser le valet de cœur, seul atout permettant de monter, même si son partenaire était maître.',
    },
    {
      reference: '7.4',
      kind: 'Cas limite',
      title: 'Couper ou ne pas sous-couper',
      situation:
        'Le joueur ne possède pas la couleur demandée. Si un adversaire est maître sans atout dans le pli, il doit couper. Si cet adversaire est déjà maître avec un atout supérieur à tous les siens, il ne peut pas surcouper.',
      application:
        'Dans le premier cas, la coupe est obligatoire. Dans le second, le joueur peut défausser une autre couleur : il n’est pas obligé de sous-couper.',
    },
    {
      reference: '7.4',
      kind: 'Cas général',
      title: 'Partenaire maître',
      situation:
        'Le joueur ne possède pas la couleur demandée et son partenaire est actuellement maître du pli.',
      application:
        'Le joueur peut poser n’importe quelle carte, y compris un atout, sans obligation de couper.',
    },
    {
      reference: '7.6',
      kind: 'Cas limite',
      title: 'Revoir le dernier pli',
      situation:
        'Un pli vient de s’achever. Avant l’entame suivante, un joueur demande à le consulter.',
      application:
        'La consultation est autorisée jusqu’à ce que la carte du gagnant commence à sortir de sa main pour le pli suivant.',
    },
  ],
  8: [
    {
      reference: '8.1',
      kind: 'Cas général',
      title: 'Annoncer les deux cartes',
      situation:
        'Cœur est l’atout. Léa possède le roi et la dame de cœur. Elle joue d’abord la dame en annonçant « belote », puis le roi en annonçant « rebelote ».',
      application:
        'Son équipe marque 20 points. L’ordre du roi et de la dame n’a pas d’importance.',
    },
    {
      reference: '8.1',
      kind: 'Cas limite',
      title: 'Une annonce oubliée',
      situation:
        'Un joueur possède le roi et la dame d’atout, mais joue la seconde carte sans annoncer « rebelote ».',
      application:
        'Aucun bonus n’est accordé, car les deux annonces doivent être prononcées au bon moment.',
    },
    {
      reference: '8.2',
      kind: 'Cas limite',
      title: 'Belote adverse pendant un capot',
      situation:
        'L’équipe en défense annonce correctement la belote-rebelote, mais l’équipe attaquante remporte les huit plis d’un capot surcoinché.',
      application:
        'Le capot est réussi et l’équipe en défense conserve exactement 20 points. Ce bonus n’est pas quadruplé.',
    },
    {
      reference: '8.3',
      kind: 'Cas général',
      title: 'Combinaisons sans bonus',
      situation:
        'Un joueur possède les quatre as ainsi qu’une suite de trois cartes de la même couleur.',
      application:
        'Aucune de ces combinaisons ne rapporte de points dans cette variante.',
    },
  ],
  9: [
    {
      reference: '9.1',
      kind: 'Cas limite',
      title: 'Atteindre exactement l’annonce',
      situation:
        'L’équipe attaquante a annoncé 80 et termine avec exactement 80 points. L’équipe en défense en marque 82.',
      application:
        'Le contrat est réussi : atteindre l’annonce suffit, même si l’équipe en défense marque davantage.',
    },
    {
      reference: '9.1',
      kind: 'Cas limite',
      title: 'L’arrondi ne sauve pas le contrat',
      situation:
        'Sans belote-rebelote, l’équipe attaquante a annoncé 100 et termine avec 99 points exacts, qui seront ensuite arrondis à 100.',
      application:
        'Le contrat est chuté, car sa réussite est vérifiée avec les points exacts avant tout arrondi.',
    },
    {
      reference: '9.2',
      kind: 'Cas limite',
      title: 'Réussir 160 sans capot',
      situation:
        'L’équipe attaquante a annoncé 160, a perdu un pli, marque 140 points exacts et possède une belote-rebelote correctement annoncée.',
      application:
        'Le contrat est réussi avec 160 points. Il ne constitue pas un capot puisque l’équipe n’a pas remporté les huit plis.',
    },
    {
      reference: '9.3',
      kind: 'Cas général',
      title: 'Jouer jusqu’au dernier pli',
      situation:
        'Après le septième pli d’un contrat à 90, l’équipe attaquante a déjà remporté 91 points exacts.',
      application:
        'Le huitième pli doit tout de même être joué.',
    },
  ],
}

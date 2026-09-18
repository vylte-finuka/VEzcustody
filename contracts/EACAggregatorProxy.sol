// SPDX-License-Identifier: MIT
// Copyright (C) Vyft, SAS

pragma solidity ^0.8.26;

///====≈====≈===
/// AggregatorV3Interface – Interface Oracle / Proof of Reserve
///====≈====≈===
/// @notice Interface minimale compatible avec un agrégateur Chainlink
/// @dev Utilisée pour récupérer la dernière valeur publiée par l'oracle.
///      Dans le cas de VEZ, cette valeur peut représenter le prix EUR/USD
///      ou une donnée de réserve publiée par l'infrastructure Oracle.
interface AggregatorV3Interface {

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

///====≈====≈===
/// EACAggregatorProxy – Oracle fixe pour VEZ / Proof of Reserve
///====≈====≈===
/// @notice Proxy Oracle utilisé par VEZproxy et reservVEZ.
///
/// @dev L'adresse de l'agrégateur est volontairement HARDCODÉE.
///      Le contrat principal n'a donc pas besoin de recevoir l'adresse
///      de l'oracle à chaque déploiement.
///
///      L'agrégateur situé à cette adresse doit implémenter
///      AggregatorV3Interface.
///
///      Pour un véritable PoR, l'agrégateur doit publier une donnée
///      correspondant réellement à la réserve attestée et non simplement
///      à un prix de marché.
///
///      Exemple :
///        answer = montant des réserves en EUR
///
///      ou, si cet oracle est utilisé comme simple Price Feed :
///        answer = prix EUR/USD
///
///      La distinction entre Price Feed et Proof of Reserve doit être
///      maintenue dans l'architecture afin de ne pas considérer un prix
///      de marché comme une preuve de collatéral.
contract EACAggregatorProxy {

    ///====≈====≈=== CONSTANTES
    /// Adresse fixe de l'agrégateur Oracle / PoR sur Slura
    /// @dev À remplacer par l'adresse réelle du contrat Oracle déployé
    ///      sur la chaîne Slura.
    address public constant AGGREGATOR =
        0x5555555555555555555555555555555555555555;

    ///====≈====≈=== VARIABLES
    AggregatorV3Interface public immutable aggregator;

    ///====≈====≈=== CONSTRUCTOR – Connexion à l'agrégateur Oracle
    constructor() {
        aggregator = AggregatorV3Interface(AGGREGATOR);
    }

    ///====≈====≈=== LATEST ROUND DATA – Valeur Oracle
    /// @notice Retourne uniquement la valeur publiée par le dernier round.
    ///
    /// @dev Cette fonction conserve volontairement la signature utilisée
    ///      actuellement par VEZproxy :
    ///
    ///          int256 price = priceFeed.latestRoundData();
    ///
    ///      Elle permet donc à VEZproxy et reservVEZ d'utiliser directement
    ///      la valeur Oracle sans gérer toute la structure Chainlink.
    ///
    /// @return answer Valeur publiée par l'agrégateur.
    function latestRoundData() external view returns (int256 answer) {
        (
            ,
            int256 _answer,
            ,
            ,
            
        ) = aggregator.latestRoundData();

        return _answer;
    }

    ///====≈====≈=== GET AGGREGATOR ADDRESS – Adresse Oracle
    /// @notice Retourne l'adresse de l'agrégateur actuellement utilisé.
    ///
    /// @dev Fonction utile pour le front-end, les outils de monitoring,
    ///      les audits et la vérification de l'infrastructure PoR.
    function getAggregatorAddress()
        external
        pure
        returns (address)
    {
        return AGGREGATOR;
    }

    ///====≈====≈=== GET FULL ROUND DATA – Données complètes Oracle
    /// @notice Retourne toutes les données du dernier round.
    ///
    /// @dev Cette fonction est particulièrement utile pour le PoR car
    ///      elle permet de vérifier :
    ///        - la valeur publiée ;
    ///        - le numéro de round ;
    ///        - la date de mise à jour ;
    ///        - la fraîcheur de la donnée Oracle.
    ///
    /// @return roundId Identifiant du round Oracle.
    /// @return answer Valeur publiée par l'agrégateur.
    /// @return startedAt Date de début du round.
    /// @return updatedAt Date de dernière mise à jour.
    /// @return answeredInRound Round ayant fourni la réponse.
    function getFullRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return aggregator.latestRoundData();
    }

    ///====≈====≈=== ORACLE HEALTH – Vérification Oracle
    /// @notice Vérifie que l'Oracle retourne une valeur exploitable.
    ///
    /// @dev Cette fonction ne constitue PAS à elle seule une preuve
    ///      de réserves. Elle vérifie uniquement que la donnée Oracle
    ///      est positive et qu'elle possède un timestamp valide.
    function isOracleValid()
        external
        view
        returns (bool)
    {
        (
            ,
            int256 answer,
            ,
            uint256 updatedAt,
            
        ) = aggregator.latestRoundData();

        return answer > 0 && updatedAt > 0;
    }
}

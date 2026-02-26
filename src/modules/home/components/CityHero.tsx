import React from 'react';
import './CityHero.css';

export const CityHero: React.FC = () => {
    return (
        <div className="city-hero-container">
            <div
                className="city-hero-image"
                style={{ backgroundImage: `url(${import.meta.env.BASE_URL}assets/city-hero-bg.png)` }}
            />
            <div className="city-hero-fade" />
        </div>
    );
};

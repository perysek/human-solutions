import {useEffect, useState} from 'react';
import type {InitialHookStatus} from '@react-buddy/ide-toolbox';

export const useInitial = (): InitialHookStatus => {
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        setLoading(false);
    }, []);
    return {loading, error: false};
};
